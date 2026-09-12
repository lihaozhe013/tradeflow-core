import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent, publicAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';
import invoiceCacheService from '@/utils/invoiceCacheService';

let supplierCode = '';
let supplierShortName = '';
let invoicedSupplierCode = '';
let createdPaymentId = -1;

beforeAll(async () => {
  invoiceCacheService.clearAllCache();

  const supplier = await prisma.partner.findFirst({
    where: { type: 0 },
    select: { code: true, short_name: true }
  });
  if (!supplier) throw new Error('No seeded supplier');
  supplierCode = supplier.code;
  supplierShortName = supplier.short_name;

  const invoiced = await prisma.inboundRecord.findFirst({
    where: { invoice_number: { not: null } },
    select: { supplier_code: true }
  });
  invoicedSupplierCode = invoiced?.supplier_code ?? supplierCode;
});

afterAll(async () => {
  if (createdPaymentId >= 0) {
    await prisma.payablePayment.delete({ where: { id: createdPaymentId } }).catch(() => undefined);
  }
  invoiceCacheService.clearAllCache();
});

describe('GET /api/payable', () => {
  it('returns the payable dashboard with balances', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/payable?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    const row = res.body.data[0] as {
      supplier_code: string;
      total_payable: number;
      total_paid: number;
      balance: number;
    };
    expect(typeof row.total_payable).toBe('number');
    expect(typeof row.total_paid).toBe('number');
    expect(typeof row.balance).toBe('number');
  });

  it('filters by supplier_short_name', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(
      `/api/payable?supplier_short_name=${encodeURIComponent(supplierShortName)}&page=1&limit=50`
    );

    expect(res.status).toBe(200);
    for (const row of res.body.data as { supplier_short_name: string }[]) {
      expect(row.supplier_short_name).toContain(supplierShortName);
    }
  });

  it('rejects readers', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/payable');
    expect(res.status).toBe(403);
  });
});

describe('Payable payment CRUD', () => {
  it('creates a payment', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/payable/payments').send({
      supplier_code: supplierCode,
      amount: 1500,
      pay_date: '2026-09-01',
      pay_method: 'bank',
      remark: 'test payment'
    });

    expect(res.status).toBe(200);
    createdPaymentId = res.body.id as number;
  });

  it('validates required payment fields', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/payable/payments').send({
      supplier_code: supplierCode,
      amount: 1
    });
    expect(res.status).toBe(400);
  });

  it('lists payments for a supplier', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/payable/payments/${supplierCode}?page=1&limit=10`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('updates a payment', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put(`/api/payable/payments/${createdPaymentId}`).send({
      supplier_code: supplierCode,
      amount: 2500,
      pay_date: '2026-09-02',
      pay_method: 'cash'
    });

    expect(res.status).toBe(200);
    const updated = await prisma.payablePayment.findUnique({ where: { id: createdPaymentId } });
    expect(updated?.amount).toBe(2500);
  });

  it('deletes a payment', async () => {
    const agent = await authAgent('editor');
    const res = await agent.delete(`/api/payable/payments/${createdPaymentId}`);

    expect(res.status).toBe(200);
    const remaining = await prisma.payablePayment.findUnique({ where: { id: createdPaymentId } });
    expect(remaining).toBeNull();
    createdPaymentId = -1;
  });
});

describe('Payable details and invoiced records', () => {
  it('returns supplier details with inbound and payment summaries', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/payable/details/${supplierCode}`);

    expect(res.status).toBe(200);
    expect(res.body.supplier.code).toBe(supplierCode);
    expect(typeof res.body.summary.balance).toBe('number');
    expect(Array.isArray(res.body.inbound_records.data)).toBe(true);
    expect(Array.isArray(res.body.payment_records.data)).toBe(true);
  });

  it('returns 404 for an unknown supplier', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/payable/details/NO_SUCH_SUPPLIER');
    expect(res.status).toBe(404);
  });

  it('lists uninvoiced inbound records', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/payable/uninvoiced/${supplierCode}?page=1&limit=10`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 404 for invoiced records before refresh', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/payable/invoiced/UNKNOWN_CACHE_${uniqueSuffix()}`);
    expect(res.status).toBe(404);
  });

  it('refreshes the supplier invoice cache and reads invoiced records', async () => {
    const agent = await authAgent('editor');
    const refresh = await agent.post(`/api/payable/invoices/refresh/${invoicedSupplierCode}`);

    expect(refresh.status).toBe(200);
    expect(Array.isArray(refresh.body.data)).toBe(true);
    expect(refresh.body.data.length).toBeGreaterThan(0);

    const read = await agent.get(`/api/payable/invoiced/${invoicedSupplierCode}?page=1&limit=10`);
    expect(read.status).toBe(200);
    expect(Array.isArray(read.body.data)).toBe(true);
    expect(read.body.total).toBe(refresh.body.data.length);
    expect(read.body.last_updated).toBeDefined();
  });
});

describe('Payable authorization', () => {
  it('requires authentication', async () => {
    const res = await publicAgent().get('/api/payable');
    expect(res.status).toBe(401);
  });
});
