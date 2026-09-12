import { describe, it, expect } from 'vitest';
import { authAgent } from '@/test/helpers/request';

const WIDE_RANGE = 'start_date=2024-01-01&end_date=2030-12-31';

describe('GET /api/analysis/data', () => {
  it('validates required date parameters', async () => {
    const agent = await authAgent('editor');
    const noDates = await agent.get('/api/analysis/data');
    expect(noDates.status).toBe(400);
    expect(noDates.body.success).toBe(false);

    const partial = await agent.get('/api/analysis/data?start_date=2026-01-01');
    expect(partial.status).toBe(400);
  });

  it('returns sales analysis for the default type (outbound)', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/analysis/data?${WIDE_RANGE}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(typeof data.sales_amount).toBe('number');
    expect(data.sales_amount).toBeGreaterThan(0);
    expect(typeof data.cost_amount).toBe('number');
    expect(typeof data.profit_amount).toBe('number');
    expect(typeof data.profit_rate).toBe('number');
    expect(data.query_params.customer_code).toBe('All');
    expect(typeof data.last_updated).toBe('string');
  });

  it('returns purchase analysis for type=inbound', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/analysis/data?${WIDE_RANGE}&type=inbound`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.query_params.type).toBe('inbound');
    expect(res.body.data.last_updated).toBeDefined();
  });

  it('accepts customer_code and product_model filters', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(
      `/api/analysis/data?${WIDE_RANGE}&customer_code=CUS&product_model=MOD-&supplier_code=SUP`
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/analysis/detail', () => {
  it('validates required date parameters', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/analysis/detail');
    expect(res.status).toBe(400);
  });

  it('returns detail rows', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/analysis/detail?${WIDE_RANGE}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/analysis/filter-options', () => {
  it('returns customers, suppliers and product options', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/analysis/filter-options');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.customers)).toBe(true);
    expect(Array.isArray(res.body.suppliers)).toBe(true);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.customers.length).toBeGreaterThan(0);
    expect(res.body.suppliers.length).toBeGreaterThan(0);
    expect(res.body.products.length).toBeGreaterThan(0);
  });
});
