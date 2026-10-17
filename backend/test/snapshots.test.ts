import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, mcpPrisma } from '@/prismaClient';
import { getOverviewSnapshot, refreshOverviewSnapshot } from '@/services/overviewSnapshotService';
import { getInvoiceSnapshot, refreshInvoiceSnapshot } from '@/services/invoiceSnapshotService';
import { refreshSnapshot } from '@/services/snapshotRefresh';
import { authAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';

const suffix = uniqueSuffix();
let partnerCode = `SNAPSHOT_${suffix}`;
let outboundId: number;
let inboundId: number;

beforeAll(async () => {
  await prisma.partner.create({ data: { code: partnerCode, short_name: partnerCode, type: 1 } });
  const outbound = await prisma.outboundRecord.create({
    data: {
      customer_code: partnerCode,
      quantity: 2,
      unit_price: 5,
      total_price: 10,
      outbound_date: new Date().toISOString().slice(0, 10),
      invoice_number: 'SNAPSHOT-SALE'
    }
  });
  outboundId = outbound.id;
  const inbound = await prisma.inboundRecord.create({
    data: {
      supplier_code: partnerCode,
      quantity: 3,
      unit_price: 7,
      total_price: 21,
      inbound_date: new Date().toISOString().slice(0, 10),
      invoice_number: 'SNAPSHOT-PURCHASE'
    }
  });
  inboundId = inbound.id;
});

afterAll(async () => {
  await prisma.outboundRecord.deleteMany({ where: { id: outboundId } });
  await prisma.inboundRecord.deleteMany({ where: { id: inboundId } });
  await prisma.partner.deleteMany({ where: { code: partnerCode } });
  await prisma.overviewSnapshot.deleteMany();
});

describe('Database snapshots', () => {
  it('does not recalculate overview reads after business data changes', async () => {
    const first = await refreshOverviewSnapshot();
    await prisma.outboundRecord.update({ where: { id: outboundId }, data: { total_price: 110 } });
    expect(await getOverviewSnapshot()).toEqual(first);
    const second = await refreshOverviewSnapshot();
    expect(second.overview.total_sales_amount).toBeCloseTo(
      first.overview.total_sales_amount + 100,
      2
    );
    expect(second.last_updated).not.toBe(first.last_updated);
    expect(await prisma.overviewSnapshot.count()).toBe(1);
    const independentRead = await mcpPrisma.overviewSnapshot.findUnique({
      where: { id: 'global' }
    });
    expect(independentRead?.last_updated.toISOString()).toBe(second.last_updated);
    const editor = await authAgent('editor');
    const top = await editor.get('/api/overview/top-sales-products');
    expect(top.body.data).toEqual(second.top_sales_products);
    expect(top.body.last_updated).toBe(second.last_updated);
  });

  it('keeps an invoice result unchanged until explicitly refreshed', async () => {
    const first = await refreshInvoiceSnapshot('receivable', partnerCode);
    expect(first.data[0]).toMatchObject({
      invoice_number: 'SNAPSHOT-SALE',
      total_amount: 110,
      record_count: 1
    });
    await prisma.outboundRecord.update({ where: { id: outboundId }, data: { total_price: 210 } });
    expect(await getInvoiceSnapshot('receivable', partnerCode)).toEqual(first);
    const second = await refreshInvoiceSnapshot('receivable', partnerCode);
    expect(second.data[0]?.total_amount).toBe(210);
    expect(second.last_updated).not.toBe(first.last_updated);
  });

  it('isolates receivable and payable snapshots with the same partner code', async () => {
    const sale = await getInvoiceSnapshot('receivable', partnerCode);
    await prisma.partner.update({ where: { code: partnerCode }, data: { type: 0 } });
    const purchase = await refreshInvoiceSnapshot('payable', partnerCode);
    expect(purchase.data[0]).toMatchObject({
      invoice_number: 'SNAPSHOT-PURCHASE',
      total_amount: 21
    });
    expect(await getInvoiceSnapshot('receivable', partnerCode)).toEqual(sale);
    expect(await prisma.invoiceSnapshot.count({ where: { partner_code: partnerCode } })).toBe(2);
  });

  it('validates partner direction, missing partners, and pagination', async () => {
    const editor = await authAgent('editor');
    expect((await editor.post(`/api/receivable/invoices/refresh/${partnerCode}`)).status).toBe(404);
    expect(
      (await editor.post('/api/payable/invoices/refresh/NO_SUCH_SNAPSHOT_PARTNER')).status
    ).toBe(404);
    for (const query of [
      'page=0',
      'page=-1',
      'limit=1.5',
      'limit=x',
      'page=1&page=2',
      'page=9007199254740992'
    ]) {
      expect((await editor.get(`/api/payable/invoiced/${partnerCode}?${query}`)).status).toBe(400);
    }
    const read = await editor.get(`/api/payable/invoiced/${partnerCode}?page=2&limit=1`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ data: [], total: 1, page: 2, limit: 1 });
  });

  it('distinguishes a saved empty invoice result from an uninitialized snapshot', async () => {
    const emptyCode = `EMPTY_${suffix}`;
    await prisma.partner.create({ data: { code: emptyCode, short_name: emptyCode, type: 1 } });
    try {
      const editor = await authAgent('editor');
      const missing = await editor.get(`/api/receivable/invoiced/${emptyCode}`);
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('SNAPSHOT_NOT_READY');
      expect(await getInvoiceSnapshot('receivable', emptyCode)).toBeNull();
      const created = await editor.post(`/api/receivable/invoices/refresh/${emptyCode}`);
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ data: [], total: 0 });
      const read = await editor.get(`/api/receivable/invoiced/${emptyCode}`);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({
        data: [],
        total: 0,
        last_updated: created.body.last_updated
      });
    } finally {
      await prisma.partner.delete({ where: { code: emptyCode } });
    }
  });

  it('rolls back writes and preserves the previous timestamp on refresh failure', async () => {
    const before = await getOverviewSnapshot();
    await expect(
      refreshSnapshot('overview:global', async (tx) => {
        await tx.overviewSnapshot.update({
          where: { id: 'global' },
          data: { data: {}, last_updated: new Date() }
        });
        throw new Error('Simulated refresh failure');
      })
    ).rejects.toThrow('Simulated refresh failure');
    expect(await getOverviewSnapshot()).toEqual(before);
    expect(await refreshOverviewSnapshot()).toBeDefined();
  });

  it('rejects overlapping refreshes across connections while allowing different scopes', async () => {
    let release!: () => void;
    let acquired!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = refreshSnapshot('overview:global', async () => {
      acquired();
      await pending;
    });
    await ready;
    try {
      const before = await getOverviewSnapshot();
      const editor = await authAgent('editor');
      const conflict = await editor.post('/api/overview/stats');
      expect(conflict.status).toBe(409);
      expect(conflict.body.code).toBe('SNAPSHOT_REFRESH_IN_PROGRESS');
      expect(await getOverviewSnapshot()).toEqual(before);
      expect(await refreshInvoiceSnapshot('payable', partnerCode)).toBeDefined();
    } finally {
      release();
      await holder;
    }
    expect(await refreshOverviewSnapshot()).toBeDefined();
  });

  it('preserves invoice data and its timestamp when the database rejects a refresh write', async () => {
    const before = await getInvoiceSnapshot('payable', partnerCode);
    await prisma.inboundRecord.update({ where: { id: inboundId }, data: { total_price: 99 } });
    await prisma.$executeRawUnsafe(`CREATE FUNCTION snapshot_test_reject_write() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated snapshot write failure'; END $$`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER snapshot_test_reject_write
        BEFORE INSERT OR UPDATE ON invoice_snapshots FOR EACH ROW
        EXECUTE FUNCTION snapshot_test_reject_write()`);
      const editor = await authAgent('editor');
      expect((await editor.post(`/api/payable/invoices/refresh/${partnerCode}`)).status).toBe(500);
      expect(await getInvoiceSnapshot('payable', partnerCode)).toEqual(before);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS snapshot_test_reject_write ON invoice_snapshots'
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION snapshot_test_reject_write()');
    }
    expect((await refreshInvoiceSnapshot('payable', partnerCode)).data[0]?.total_amount).toBe(99);
  });

  it('cascades partner code changes and deletion to invoice snapshots', async () => {
    const oldCode = partnerCode;
    const newCode = `${partnerCode}_RENAMED`;
    await prisma.partner.update({ where: { code: partnerCode }, data: { code: newCode } });
    partnerCode = newCode;
    expect(await getInvoiceSnapshot('receivable', oldCode)).toBeNull();
    expect(await getInvoiceSnapshot('payable', partnerCode)).not.toBeNull();
    expect(await getInvoiceSnapshot('receivable', partnerCode)).not.toBeNull();
    await prisma.outboundRecord.delete({ where: { id: outboundId } });
    await prisma.inboundRecord.delete({ where: { id: inboundId } });
    await prisma.partner.delete({ where: { code: partnerCode } });
    expect(await prisma.invoiceSnapshot.count({ where: { partner_code: partnerCode } })).toBe(0);
  });
});
