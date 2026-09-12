import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent, publicAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';
import invoiceCacheService from '@/utils/invoiceCacheService';

let customerCode = '';
let customerShortName = '';
let invoicedCustomerCode = '';
let createdPaymentId = -1;

beforeAll(async () => {
  invoiceCacheService.clearAllCache();

  const customer = await prisma.partner.findFirst({
    where: { type: 1 },
    select: { code: true, short_name: true }
  });
  if (!customer) throw new Error('No seeded customer');
  customerCode = customer.code;
  customerShortName = customer.short_name;

  const invoiced = await prisma.outboundRecord.findFirst({
    where: { invoice_number: { not: null } },
    select: { customer_code: true }
  });
  invoicedCustomerCode = invoiced?.customer_code ?? customerCode;
});

afterAll(async () => {
  if (createdPaymentId >= 0) {
    await prisma.receivablePayment
      .delete({ where: { id: createdPaymentId } })
      .catch(() => undefined);
  }
  invoiceCacheService.clearAllCache();
});

describe('GET /api/receivable', () => {
  it('returns the receivable dashboard with balances', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/receivable?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    const row = res.body.data[0] as {
      customer_code: string;
      total_receivable: number;
      total_paid: number;
      balance: number;
    };
    expect(typeof row.total_receivable).toBe('number');
    expect(typeof row.total_paid).toBe('number');
    expect(typeof row.balance).toBe('number');
  });

  it('filters by customer_short_name', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(
      `/api/receivable?customer_short_name=${encodeURIComponent(customerShortName)}&page=1&limit=50`
    );

    expect(res.status).toBe(200);
    for (const row of res.body.data as { customer_short_name: string }[]) {
      expect(row.customer_short_name).toContain(customerShortName);
    }
  });

  it('rejects readers', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/receivable');
    expect(res.status).toBe(403);
  });
});

describe('Receivable payment CRUD', () => {
  it('creates a payment', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/receivable/payments').send({
      customer_code: customerCode,
      amount: 1000,
      pay_date: '2026-09-01',
      pay_method: 'bank',
      remark: 'test payment'
    });

    expect(res.status).toBe(200);
    createdPaymentId = res.body.id as number;
  });

  it('validates required payment fields', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/receivable/payments').send({
      customer_code: customerCode,
      amount: 1
    });
    expect(res.status).toBe(400);
  });

  it('lists payments for a customer', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/receivable/payments/${customerCode}?page=1&limit=10`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('updates a payment', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put(`/api/receivable/payments/${createdPaymentId}`).send({
      customer_code: customerCode,
      amount: 2000,
      pay_date: '2026-09-02',
      pay_method: 'cash'
    });

    expect(res.status).toBe(200);
    const updated = await prisma.receivablePayment.findUnique({ where: { id: createdPaymentId } });
    expect(updated?.amount).toBe(2000);
  });

  it('deletes a payment', async () => {
    const agent = await authAgent('editor');
    const res = await agent.delete(`/api/receivable/payments/${createdPaymentId}`);

    expect(res.status).toBe(200);
    const remaining = await prisma.receivablePayment.findUnique({
      where: { id: createdPaymentId }
    });
    expect(remaining).toBeNull();
    createdPaymentId = -1;
  });
});

describe('Receivable details and invoiced records', () => {
  it('returns customer details with outbound and payment summaries', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/receivable/details/${customerCode}`);

    expect(res.status).toBe(200);
    expect(res.body.customer.code).toBe(customerCode);
    expect(typeof res.body.summary.balance).toBe('number');
    expect(Array.isArray(res.body.outbound_records.data)).toBe(true);
    expect(Array.isArray(res.body.payment_records.data)).toBe(true);
  });

  it('returns 404 for an unknown customer', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/receivable/details/NO_SUCH_CUSTOMER');
    expect(res.status).toBe(404);
  });

  it('lists uninvoiced outbound records', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/receivable/uninvoiced/${customerCode}?page=1&limit=10`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 404 for invoiced records before refresh', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/receivable/invoiced/UNKNOWN_CACHE_${uniqueSuffix()}`);
    expect(res.status).toBe(404);
  });

  it('refreshes the invoice cache and reads invoiced records', async () => {
    const agent = await authAgent('editor');
    const refresh = await agent.post(`/api/receivable/invoices/refresh/${invoicedCustomerCode}`);

    expect(refresh.status).toBe(200);
    expect(Array.isArray(refresh.body.data)).toBe(true);
    expect(refresh.body.data.length).toBeGreaterThan(0);

    const read = await agent.get(
      `/api/receivable/invoiced/${invoicedCustomerCode}?page=1&limit=10`
    );
    expect(read.status).toBe(200);
    expect(Array.isArray(read.body.data)).toBe(true);
    expect(read.body.total).toBe(refresh.body.data.length);
    expect(read.body.last_updated).toBeDefined();
  });
});

describe('Receivable authorization', () => {
  it('requires authentication', async () => {
    const res = await publicAgent().get('/api/receivable');
    expect(res.status).toBe(401);
  });
});
