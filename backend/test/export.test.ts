import { describe, it, expect } from 'vitest';
import type request from 'supertest';
import type { Response } from 'superagent';
import { authAgent, publicAgent } from '@/test/helpers/request';
import { assertXlsxExport } from '@/test/helpers/assertXlsx';

const XLSX_BODY = { tables: '123' };

type TestAgent = ReturnType<typeof request.agent>;

async function postBinary(agent: TestAgent, url: string, body: unknown): Promise<Response> {
  const req = agent
    .post(url)
    .send(body as object)
    .buffer(true);
  req.parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: string | Buffer) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });
  return req;
}

describe('Export endpoints (xlsx)', () => {
  it('exports base info', async () => {
    const agent = await authAgent('editor');
    const res = await postBinary(agent, '/api/export/base-info', XLSX_BODY);
    assertXlsxExport(res);
  });

  it('exports inbound/outbound records', async () => {
    const agent = await authAgent('editor');
    const res = await postBinary(agent, '/api/export/inbound-outbound', {
      tables: '12',
      dateFrom: '2024-01-01',
      dateTo: '2026-12-31'
    });
    assertXlsxExport(res);
  });

  it('exports statement', async () => {
    const agent = await authAgent('editor');
    const res = await postBinary(agent, '/api/export/statement', {
      dateFrom: '2024-01-01',
      dateTo: '2026-12-31'
    });
    assertXlsxExport(res);
  });

  it('exports receivable/payable details', async () => {
    const agent = await authAgent('editor');
    const res = await postBinary(agent, '/api/export/receivable-payable', {});
    assertXlsxExport(res);
  });

  it('exports invoice details for a partner', async () => {
    const agent = await authAgent('editor');
    const res = await postBinary(agent, '/api/export/invoice', {
      partnerCode: 'SUP0'
    });
    assertXlsxExport(res);
  });

  it('returns 400 for invoice export without partnerCode', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/export/invoice').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Partner code is required');
  });

  it('exports analysis data', async () => {
    const agent = await authAgent('editor');
    const res = await postBinary(agent, '/api/export/analysis', {
      analysisData: {
        sales_amount: 100,
        cost_amount: 60,
        profit_amount: 40,
        profit_rate: 40,
        last_updated: new Date().toISOString()
      },
      detailData: [],
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      customerCode: 'All',
      productModel: 'All'
    });
    assertXlsxExport(res);
  });

  it('returns 400 for analysis export without analysisData', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/export/analysis').send({ detailData: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Analysis data is required');
  });

  it('exports advanced analysis for products', async () => {
    const agent = await authAgent('editor');
    const res = await postBinary(agent, '/api/export/advanced-analysis', {
      exportType: 'product',
      startDate: '2024-01-01',
      endDate: '2026-12-31'
    });
    assertXlsxExport(res);
  });

  it('exports advanced analysis for customers', async () => {
    const agent = await authAgent('editor');
    const res = await postBinary(agent, '/api/export/advanced-analysis', {
      exportType: 'customer',
      startDate: '2024-01-01',
      endDate: '2026-12-31'
    });
    assertXlsxExport(res);
  });

  it('exports inventory', async () => {
    const agent = await authAgent('editor');
    const res = await postBinary(agent, '/api/export/inventory', {});
    assertXlsxExport(res);
  });
});

describe('GET /api/export/status', () => {
  it('reports available exports', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/export/status');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.available_exports)).toBe(true);
    expect(res.body.available_exports.length).toBeGreaterThan(0);
  });
});

describe('Export authorization', () => {
  it('forbids readers from exporting', async () => {
    const agent = await authAgent('reader');
    const res = await agent.post('/api/export/inventory').send({});
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await publicAgent().post('/api/export/inventory').send({});
    expect(res.status).toBe(401);
  });
});
