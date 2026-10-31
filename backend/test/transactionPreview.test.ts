import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { authAgent } from '@/test/helpers/request';

describe('Transaction export previews', () => {
  it('uses system template headings, ordering, visibility and worksheet names without changing the saved template', async () => {
    const admin = await authAgent('superuser');
    const editor = await authAgent('editor');
    const settings = await admin.get('/api/settings');
    const original = settings.body.data.find(
      (row: { section: string }) => row.section === 'export-templates'
    );
    let version = original.version;
    try {
      const value = structuredClone(original.value);
      value.products = {
        sheetName: 'Custom Products',
        columns: [
          { key: 'product_model', label: 'Custom model heading', visible: true },
          { key: 'code', label: 'Hidden code', visible: false }
        ]
      };
      const saved = await admin.put('/api/settings/export-templates').send({ value, version });
      expect(saved.status).toBe(200);
      version = saved.body.data.version;
      const products = await editor.get('/api/products');
      const code = products.body.data[0].code;
      const result = await editor
        .post('/api/export/previews/records')
        .send({ source: 'products', filters: {}, keys: [code] });
      expect(result.status).toBe(200);
      expect(result.body.sheetName).toBe('Custom Products');
      expect(result.body.columns.slice(0, 2)).toMatchObject([
        { key: 'product_model', label: 'Custom model heading', visible: true },
        { key: 'code', label: 'Hidden code', visible: false }
      ]);
      expect(result.body.columns.filter((c: { visible: boolean }) => c.visible)).toHaveLength(1);
      const download = await editor
        .post(`/api/export/previews/${result.body.id}/download`)
        .send({
          format: 'xlsx',
          columns: result.body.columns.map((c: { key: string }) =>
            c.key === 'product_model' ? { ...c, label: 'This export only' } : c
          ),
          font: 'Arial',
          fontSize: 11
        })
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
      expect(download.status).toBe(200);
      const book = XLSX.read(download.body, { type: 'buffer' });
      expect(book.SheetNames).toEqual(['Custom Products']);
      expect(book.Sheets['Custom Products']!['A1']?.v).toBe('This export only');
      const fresh = await editor
        .post('/api/export/previews/records')
        .send({ source: 'products', filters: {}, keys: [code] });
      expect(fresh.body.columns[0].label).toBe('Custom model heading');
    } finally {
      const restored = await admin
        .put('/api/settings/export-templates')
        .send({ value: original.value, version });
      expect(restored.status).toBe(200);
    }
  });
  it('exports exactly the selected records and preserves column order and values', async () => {
    const agent = await authAgent('editor');
    const list = await agent.get('/api/outbound');
    const ids = list.body.data.slice(0, 2).map((row: { id: number }) => row.id);
    expect(ids).toHaveLength(2);
    const result = await agent
      .post('/api/export/previews/transactions')
      .send({ direction: 'outbound', filters: {}, ids });
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(2);
    expect(result.body.rows.map((row: { id: number }) => row.id).sort()).toEqual([...ids].sort());
    const columns = [...result.body.columns]
      .reverse()
      .map((column: { key: string; label: string }) => ({ ...column, visible: true }));
    const download = await agent
      .post(`/api/export/previews/${result.body.id}/download`)
      .send({ format: 'xlsx', columns, font: 'Arial', fontSize: 12 })
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    const book = XLSX.read(download.body, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]!]!, {
      header: 1
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(columns.map((c: { label: string }) => c.label));
  });

  it('rejects selected records outside the filter and unauthorized columns', async () => {
    const agent = await authAgent('editor');
    const list = await agent.get('/api/outbound');
    const id = list.body.data[0].id;
    const invalid = await agent.post('/api/export/previews/transactions').send({
      direction: 'outbound',
      filters: { productModel: 'NONEXISTENT-EXPORT-FILTER' },
      ids: [id]
    });
    expect(invalid.status).toBe(409);
    const valid = await agent
      .post('/api/export/previews/transactions')
      .send({ direction: 'outbound', filters: {}, ids: [id] });
    const download = await agent.post(`/api/export/previews/${valid.body.id}/download`).send({
      format: 'csv',
      columns: [{ key: 'password', label: 'Password', visible: true, width: 18 }],
      font: 'Arial',
      fontSize: 11
    });
    expect(download.status).toBe(400);
  });

  it('prevents another account from downloading a snapshot', async () => {
    const owner = await authAgent('editor');
    const other = await authAgent('superuser');
    const list = await owner.get('/api/inbound');
    const preview = await owner
      .post('/api/export/previews/transactions')
      .send({ direction: 'inbound', filters: {}, ids: [list.body.data[0].id] });
    const response = await other
      .post(`/api/export/previews/${preview.body.id}/download`)
      .send({ format: 'csv', columns: preview.body.columns, font: 'Arial', fontSize: 11 });
    expect(response.status).toBe(404);
  });

  it('requires export permissions', async () => {
    const reader = await authAgent('reader');
    expect(
      (
        await reader
          .post('/api/export/previews/transactions')
          .send({ direction: 'outbound', filters: {} })
      ).status
    ).toBe(403);
  });
  it('previews filtered master data and scopes account details to selected partners', async () => {
    const agent = await authAgent('editor');
    const products = await agent.get('/api/products');
    const code = products.body.data[0].code;
    const product = await agent
      .post('/api/export/previews/records')
      .send({ source: 'products', filters: { code }, keys: [code] });
    expect(product.status).toBe(200);
    expect(product.body.total).toBe(1);
    expect(product.body.rows[0].code).toBe(code);
    const invalid = await agent
      .post('/api/export/previews/records')
      .send({ source: 'products', filters: { code: 'NO-MATCH-FOR-EXPORT' }, keys: [code] });
    expect(invalid.status).toBe(409);
    const accounts = await agent.get('/api/receivable');
    const partner = accounts.body.data[0].customer_code;
    const details = await agent
      .post('/api/export/previews/records')
      .send({ source: 'receivable', filters: {}, keys: [partner] });
    expect(details.status).toBe(200);
    expect(details.body.total).toBeGreaterThan(0);
    expect(
      details.body.rows.every((row: { partner_code: string }) => row.partner_code === partner)
    ).toBe(true);
    expect(details.body.columns.map((c: { key: string }) => c.key)).toContain('payment_amount');
  });
  it('previews combined statements and exports all worksheets as CSV files', async () => {
    const agent = await authAgent('editor');
    const preview = await agent
      .post('/api/export/previews/reports')
      .send({ report: 'statement', filters: { tables: '12' } });
    expect(preview.status).toBe(200);
    expect(preview.body.sheets.map((sheet: { key: string }) => sheet.key)).toEqual([
      'inbound',
      'outbound'
    ]);
    expect(preview.body.total).toBeGreaterThan(0);
    const download = await agent
      .post(`/api/export/previews/${preview.body.id}/download`)
      .send({
        format: 'csv',
        columns: preview.body.columns,
        sheets: preview.body.sheets.map((sheet: { key: string; columns: unknown[] }) => ({
          key: sheet.key,
          columns: sheet.columns
        })),
        font: 'Arial',
        fontSize: 11
      })
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/zip');
    expect(Object.keys(unzipSync(download.body))).toHaveLength(2);
  });

  it('requires a partner for invoices and uses the invoice system template', async () => {
    const agent = await authAgent('editor');
    expect(
      (await agent.post('/api/export/previews/reports').send({ report: 'invoice', filters: {} }))
        .status
    ).toBe(400);
    const records = await agent.get('/api/outbound');
    const preview = await agent
      .post('/api/export/previews/reports')
      .send({ report: 'invoice', filters: { partnerCode: records.body.data[0].customer_code } });
    expect(preview.status).toBe(200);
    expect(preview.body.sheets).toHaveLength(1);
    expect(preview.body.total).toBeGreaterThan(0);
    expect(preview.body.columns.map((c: { key: string }) => c.key)).toContain('quantity');
    expect(preview.body.columns.map((c: { key: string }) => c.key)).toContain('category');
  });
});
