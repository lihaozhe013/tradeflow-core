import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/prismaClient';
import type { Prisma, SystemSetting } from '@/prisma/client';
import { authAgent, publicAgent } from '@/test/helpers/request';
import { initializeSettings, readSetting, readRuntimeSettings } from '@/settings/service';
import { parseSetting } from '@/settings/schema';
import { DEFAULT_SETTINGS } from '@/settings/defaults';
import { config } from '@/utils/paths';
import { generateTransactionExcel } from '@/routes/export/utils/transactionExporter';
import { generateAnalysisExcel } from '@/routes/export/utils/analysisExporter';
import { generateBaseInfoExcel } from '@/routes/export/utils/baseInfoExporter';
import * as XLSX from 'xlsx';

let snapshot: SystemSetting[];
beforeEach(async () => {
  snapshot = await prisma.systemSetting.findMany();
});
afterEach(async () => {
  await prisma.systemSetting.deleteMany();
  await prisma.systemSetting.createMany({
    data: snapshot.map((row) => ({ ...row, value: row.value as Prisma.InputJsonValue }))
  });
});

describe('Database system settings', () => {
  it('requires authentication and limits full settings to superusers', async () => {
    expect((await publicAgent().get('/api/settings/runtime')).status).toBe(401);
    expect((await publicAgent().get('/api/settings')).status).toBe(401);
    for (const role of ['reader', 'editor'] as const) {
      const agent = await authAgent(role);
      const runtime = await agent.get('/api/settings/runtime');
      expect(runtime.status).toBe(200);
      expect(Object.keys(runtime.body).sort()).toEqual([
        'currency_unit_symbol',
        'paymentMethods',
        'productCategories'
      ]);
      expect(runtime.body.paymentMethods.config).toBeUndefined();
      expect((await agent.get('/api/settings')).status).toBe(403);
      expect(
        (
          await agent
            .put('/api/settings/general')
            .send({ version: 1, value: { currency_unit_symbol: 'X' } })
        ).status
      ).toBe(403);
    }
    const admin = await authAgent('superuser');
    const response = await admin.get('/api/settings');
    expect(response.body.data).toHaveLength(5);
    expect(Object.keys(response.body.catalog)).toHaveLength(23);
  });
  it('does not grant settings or About access with authentication disabled', async () => {
    const original = config.auth;
    config.auth = { ...original, enabled: false };
    try {
      expect((await publicAgent().get('/api/settings/runtime')).status).toBe(200);
      expect((await publicAgent().get('/api/settings')).status).toBe(403);
      expect((await publicAgent().get('/api/about')).status).toBe(403);
      expect(
        (
          await publicAgent()
            .put('/api/settings/general')
            .send({ version: 1, value: { currency_unit_symbol: 'X' } })
        ).status
      ).toBe(403);
    } finally {
      config.auth = original;
    }
  });
  it('saves immediately, preserves values on initialization, and audits metadata only', async () => {
    const admin = await authAgent('superuser');
    const row = await prisma.systemSetting.findUniqueOrThrow({ where: { section: 'general' } });
    const response = await admin
      .put('/api/settings/general')
      .send({ version: row.version, value: { currency_unit_symbol: 'CHF' } });
    expect(response.status).toBe(200);
    expect(response.body.data.version).toBe(row.version + 1);
    await initializeSettings();
    expect((await readRuntimeSettings()).currency_unit_symbol).toBe('CHF');
    const audit = await prisma.systemLog.findFirstOrThrow({
      where: { resource: '/api/settings/general', params: { contains: 'currency_unit_symbol' } },
      orderBy: { id: 'desc' }
    });
    expect(audit.params).not.toContain('CHF');
    expect(JSON.parse(audit.params!)).toMatchObject({
      section: 'general',
      fields: ['currency_unit_symbol'],
      version: row.version + 1
    });
  });
  it('only accepts one concurrent update for the same version', async () => {
    const admin = await authAgent('superuser');
    const row = await prisma.systemSetting.findUniqueOrThrow({ where: { section: 'general' } });
    const responses = await Promise.all(
      ['A', 'B'].map((symbol) =>
        admin
          .put('/api/settings/general')
          .send({ version: row.version, value: { currency_unit_symbol: symbol } })
      )
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it('rejects unsupported sections, properties, empty lists and missing defaults', async () => {
    const admin = await authAgent('superuser');
    for (const [section, value] of [
      ['unknown', {}],
      ['general', { currency_unit_symbol: '' }],
      ['general', { currency_unit_symbol: '$', extra: true }],
      ['product-categories', { list: [], default: 'Other' }],
      ['product-categories', { list: ['A', ' A '], default: 'A' }],
      [
        'payment-methods',
        { items: [{ key: 'cash', code: 'CASH', label: 'Cash' }], defaultCode: 'MISSING' }
      ]
    ])
      expect((await admin.put(`/api/settings/${section}`).send({ version: 1, value })).status).toBe(
        400
      );
  });
  it('keeps historical category and payment text after options change', async () => {
    const product = await prisma.product.findFirstOrThrow();
    const payment = await prisma.receivablePayment.findFirstOrThrow();
    const originalCategory = product.category;
    const originalMethod = payment.pay_method;
    const admin = await authAgent('superuser');
    for (const [section, value] of [
      ['product-categories', { list: ['New category'], default: 'New category' }],
      [
        'payment-methods',
        {
          items: [{ key: 'new_method', code: 'NEW_METHOD', label: 'New method' }],
          defaultCode: 'NEW_METHOD'
        }
      ]
    ] as const) {
      const row = await prisma.systemSetting.findUniqueOrThrow({ where: { section } });
      expect(
        (await admin.put(`/api/settings/${section}`).send({ version: row.version, value })).status
      ).toBe(200);
    }
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { code: product.code } })).category
    ).toBe(originalCategory);
    expect(
      (await prisma.receivablePayment.findUniqueOrThrow({ where: { id: payment.id } })).pay_method
    ).toBe(originalMethod);
    const editor = await authAgent('editor');
    expect(
      (
        await editor
          .put(`/api/products/${encodeURIComponent(product.code)}`)
          .send({ category: originalCategory, remark: product.remark })
      ).status
    ).toBe(200);
    expect((await editor.get('/api/products/categories')).body.data).toContain(originalCategory);
  });
  it('loads updated About and rejects invalid contact information', async () => {
    const admin = await authAgent('superuser');
    const row = await prisma.systemSetting.findUniqueOrThrow({ where: { section: 'about' } });
    const value = await readSetting('about');
    value.company.name = 'Updated company';
    expect(
      (await admin.put('/api/settings/about').send({ version: row.version, value })).status
    ).toBe(200);
    expect((await admin.get('/api/about')).body.company.name).toBe('Updated company');
    value.contact.email = 'invalid';
    expect(
      (await admin.put('/api/settings/about').send({ version: row.version + 1, value })).status
    ).toBe(400);
  });
  it('uses configured heading order, hidden columns, and receipt numbers in real XLSX output', () => {
    const templates = parseSetting('export-templates', DEFAULT_SETTINGS['export-templates']);
    templates.outbound.sheetName = 'Custom export';
    templates.outbound.columns = [
      { key: 'receipt_number', label: 'Receipt' },
      { key: 'quantity', label: 'Hidden', visible: false },
      { key: 'product_model', label: 'Model' }
    ];
    const buffer = generateTransactionExcel(
      { outbound: [{ receipt_number: 'R-100', product_model: 'Model A', quantity: 5 }] as never },
      { tables: '2' },
      templates
    );
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Custom export']);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['Custom export']!, { header: 1 })).toEqual([
      ['Receipt', 'Model'],
      ['R-100', 'Model A']
    ]);
    templates.partners.sheetName = 'Same';
    templates.products.sheetName = 'sAmE';
    const duplicate = XLSX.read(
      generateBaseInfoExcel({ partners: [], products: [] }, { tables: '12' }, templates),
      { type: 'buffer' }
    );
    expect(new Set(duplicate.SheetNames.map((name) => name.toLowerCase())).size).toBe(2);
    templates.analysis_summary.labels!['sales_amount'] = 'Configured sales';
    const analysis = XLSX.read(
      generateAnalysisExcel(
        {
          analysisData: { sales_amount: 12, cost_amount: 5, profit_amount: 7, profit_rate: 58 },
          detailData: [],
          startDate: '2026-01-01',
          endDate: '2026-01-02'
        },
        templates
      ),
      { type: 'buffer' }
    );
    expect(
      JSON.stringify(
        XLSX.utils.sheet_to_json(analysis.Sheets[analysis.SheetNames[0]!]!, { header: 1 })
      )
    ).toContain('Configured sales');
  });
  it('uses a saved database template on the next export request', async () => {
    const admin = await authAgent('superuser');
    const row = await prisma.systemSetting.findUniqueOrThrow({
      where: { section: 'export-templates' }
    });
    const value = readTemplates();
    value.products.sheetName = 'Products from database';
    value.products.columns = [
      { key: 'product_model', label: 'Configured model' },
      { key: 'code', label: 'Configured code' }
    ];
    expect(
      (await admin.put('/api/settings/export-templates').send({ version: row.version, value }))
        .status
    ).toBe(200);
    const response = await admin
      .post('/api/export/base-info')
      .send({ tables: '2' })
      .buffer(true)
      .parse((stream, callback) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(response.status).toBe(200);
    const workbook = XLSX.read(response.body as Buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Products from database']);
    const data = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['Products from database']!, {
      header: 1
    });
    expect(data[0]).toEqual(['Configured model', 'Configured code']);
    expect(data.length).toBeGreaterThan(1);
  });

  it('validates Excel constraints, column allowlists, visibility and labels', () => {
    for (const change of [
      (v: ReturnType<typeof readTemplates>) => {
        v.inventory.columns = [{ key: 'not_a_field', label: 'Unknown' }];
      },
      (v: ReturnType<typeof readTemplates>) => {
        v.inventory.columns.forEach((c) => {
          c.visible = false;
        });
      },
      (v: ReturnType<typeof readTemplates>) => {
        v.inventory.sheetName = 'Invalid/name';
      },
      (v: ReturnType<typeof readTemplates>) => {
        delete v.analysis_summary.labels!['sales_amount'];
      }
    ]) {
      const value = readTemplates();
      change(value);
      expect(() => parseSetting('export-templates', value)).toThrow();
    }
  });
});
function readTemplates() {
  return parseSetting('export-templates', DEFAULT_SETTINGS['export-templates']);
}
