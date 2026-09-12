import { describe, it, expect } from 'vitest';
import { authAgent } from '@/test/helpers/request';

describe('GET /api/inventory', () => {
  it('returns paginated inventory with product_model mapping', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/inventory');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination.total).toBeGreaterThan(0);

    const row = res.body.data[0] as { product_model: string; current_inventory: number };
    expect(typeof row.product_model).toBe('string');
    expect(typeof row.current_inventory).toBe('number');
    expect(res.body.data[0]).not.toHaveProperty('quantity');
  });

  it('filters by product_model substring', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/inventory?product_model=MOD-');

    expect(res.status).toBe(200);
    const rows = res.body.data as { product_model: string }[];
    if (rows.length > 0) {
      for (const row of rows) {
        expect(row.product_model).toContain('MOD-');
      }
    }
  });
});

describe('GET /api/inventory/total-cost-estimate', () => {
  it('computes a non-negative total cost estimate', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/inventory/total-cost-estimate');

    expect(res.status).toBe(200);
    expect(typeof res.body.total_cost_estimate).toBe('number');
    expect(res.body.total_cost_estimate).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.last_updated).toBe('string');
  });
});

describe('POST /api/inventory/refresh', () => {
  it('recalculates inventory from records and returns counts', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/inventory/refresh');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.products_count).toBe('number');
    expect(res.body.products_count).toBeGreaterThan(0);
  });
});
