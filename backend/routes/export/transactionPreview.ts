import { zipSync } from 'fflate';
import { prepareReport, reportSpec } from './reportPreview';
import { safeSheetName } from './utils/exportUtils';
import decimalCalc from '@/utils/decimalCalculator';
import { readExportTemplates } from '@/settings/service';
import { previewColumns } from './previewTemplates';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '@/prismaClient';
import { listTransactions } from '@/services/readService';
import { resolveFilesInCachePath } from '@/utils/paths';

const text = z.string().max(100).optional();
const filters = z
  .strictObject({
    partnerShortName: text,
    productModel: text,
    keyword: text,
    orderNumber: text,
    invoiceNumber: text,
    receiptNumber: text,
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    sortField: z
      .enum(['id', 'inbound_date', 'outbound_date', 'unit_price', 'total_price'])
      .optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate);
const spec = z.strictObject({
  direction: z.enum(['inbound', 'outbound']),
  filters,
  ids: z.array(z.number().int().positive()).min(1).max(10000).optional()
});
const column = z.strictObject({
  key: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  visible: z.boolean(),
  width: z.number().min(5).max(100)
});
type Cell = string | number | null;
interface Snapshot {
  owner: string;
  expiresAt: number;
  direction: string;
  sheetName?: string;
  sheets?: Awaited<ReturnType<typeof prepareReport>>;
  columns: z.infer<typeof column>[];
  rows: Record<string, Cell>[];
}
const router = Router();
const snapshotPath = (id: string) => resolveFilesInCachePath('export-previews', `${id}.json`);

router.post('/previews/transactions', async (req, res) => {
  const parsed = spec.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid export scope.', issues: parsed.error.issues });
    return;
  }
  const input = parsed.data;
  const result = await prisma.$transaction(
    async (db) =>
      listTransactions(db, {
        ...input.filters,
        direction: input.direction,
        ...(input.ids ? { ids: [...new Set(input.ids)] } : {}),
        page: 1,
        limit: 100001
      }),
    { isolationLevel: 'RepeatableRead' }
  );
  if (result.total > 100000) {
    res.status(422).json({ message: 'Narrow the filters to at most 100000 records.' });
    return;
  }
  if (input.ids && result.total !== new Set(input.ids).size) {
    res.status(409).json({ message: 'Selected records changed. Refresh the table.' });
    return;
  }
  const inbound = input.direction === 'inbound';
  const keys = [
    'id',
    inbound ? 'inbound_date' : 'outbound_date',
    inbound ? 'supplier_code' : 'customer_code',
    'partner_name',
    'product_model',
    'quantity',
    'unit_price',
    'total_price',
    'order_number',
    'receipt_number',
    'invoice_number'
  ];
  const template = (await readExportTemplates())[input.direction];
  const columns = previewColumns([template], keys, {
    [inbound ? 'supplier_short_name' : 'customer_short_name']: 'partner_name'
  });
  const fieldKeys = [...new Set([...keys, ...columns.map((c) => c.key)])];
  const rows = result.data.map((record) => {
    const raw = {
      ...record,
      partner_name: record.partner.short_name,
      supplier_full_name: record.partner.full_name,
      customer_full_name: record.partner.full_name,
      product_model: record.product?.product_model ?? null
    } as Record<string, unknown>;
    return Object.fromEntries(fieldKeys.map((key) => [key, raw[key] ?? null])) as Record<
      string,
      Cell
    >;
  });
  const id = randomUUID();
  const snapshot: Snapshot = {
    owner: req.user!.username,
    direction: input.direction,
    sheetName: template.sheetName,
    expiresAt: Date.now() + 86400000,
    columns,
    rows
  };
  const path = snapshotPath(id);
  await fs.mkdir(resolveFilesInCachePath('export-previews'), { recursive: true });
  await fs.writeFile(path, JSON.stringify(snapshot), { flag: 'wx' });
  res.json({
    id,
    sheetName: snapshot.sheetName,
    columns,
    rows: rows.slice(0, 50),
    total: rows.length,
    expiresAt: new Date(snapshot.expiresAt).toISOString()
  });
});

router.post('/previews/records', async (req, res) => {
  const parsed = z
    .strictObject({
      source: z.enum(['partners', 'products', 'prices', 'receivable', 'payable', 'inventory']),
      filters: z.strictObject({
        code: text,
        short_name: text,
        full_name: text,
        type: z.union([z.literal(0), z.literal(1)]).optional(),
        category: text,
        product_model: text,
        partner_short_name: text,
        effective_date: z.iso.date().optional(),
        customer_short_name: text,
        supplier_short_name: text
      }),
      keys: z
        .array(z.union([z.string().min(1).max(100), z.number().int().positive()]))
        .min(1)
        .max(10000)
        .optional()
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid export scope.', issues: parsed.error.issues });
    return;
  }
  const { source, filters: f, keys: selected } = parsed.data;
  if (
    source === 'prices' &&
    selected?.some((key) => !Number.isSafeInteger(Number(key)) || Number(key) <= 0)
  ) {
    res.status(400).json({ message: 'Invalid price record IDs.' });
    return;
  }
  const data = await prisma.$transaction(
    async (db) => {
      if (source === 'inventory') {
        const items = await db.inventory.findMany({
          where: {
            ...(f.product_model ? { product_model: { contains: f.product_model } } : {}),
            ...(selected ? { AND: { product_model: { in: selected.map(String) } } } : {})
          },
          orderBy: { product_model: 'asc' },
          take: 100001
        });
        const latest = await db.inboundRecord.findMany({
          where: { product: { product_model: { in: items.map((item) => item.product_model) } } },
          orderBy: [{ inbound_date: 'desc' }, { id: 'desc' }],
          distinct: ['product_code'],
          select: { unit_price: true, product: { select: { product_model: true } } }
        });
        const costs = new Map<string, number>();
        for (const price of latest) {
          const model = price.product?.product_model;
          if (model && !costs.has(model)) costs.set(model, price.unit_price ?? 0);
        }
        return {
          key: 'product_model',
          columns: ['product_model', 'quantity'],
          rows: items.map((item) => {
            const unit_cost = costs.get(item.product_model) ?? 0;
            return {
              ...item,
              unit_cost,
              total_value: decimalCalc.toDbNumber(decimalCalc.multiply(item.quantity, unit_cost), 2)
            };
          })
        };
      }
      if (source === 'partners')
        return {
          key: 'code',
          columns: ['code', 'short_name', 'full_name', 'type', 'contact_person', 'contact_phone'],
          rows: await db.partner.findMany({
            where: {
              ...(f.code ? { code: { contains: f.code } } : {}),
              ...(f.short_name ? { short_name: { contains: f.short_name } } : {}),
              ...(f.full_name ? { full_name: { contains: f.full_name } } : {}),
              ...(f.type !== undefined ? { type: f.type } : {}),
              ...(selected ? { AND: { code: { in: selected.map(String) } } } : {})
            },
            orderBy: [{ short_name: 'asc' }, { code: 'asc' }],
            take: 100001
          })
        };
      if (source === 'products')
        return {
          key: 'code',
          columns: ['code', 'product_model', 'category', 'remark'],
          rows: await db.product.findMany({
            where: {
              ...(f.code ? { code: { contains: f.code } } : {}),
              ...(f.product_model ? { product_model: { contains: f.product_model } } : {}),
              ...(f.category ? { category: f.category } : {}),
              ...(selected ? { AND: { code: { in: selected.map(String) } } } : {})
            },
            orderBy: [{ category: 'asc' }, { product_model: 'asc' }, { code: 'asc' }],
            take: 100001
          })
        };
      if (source === 'prices')
        return {
          key: 'id',
          columns: ['id', 'partner_short_name', 'product_model', 'effective_date', 'unit_price'],
          rows: await db.productPrice.findMany({
            where: {
              ...(f.partner_short_name
                ? { partner_short_name: { contains: f.partner_short_name } }
                : {}),
              ...(f.product_model ? { product_model: { contains: f.product_model } } : {}),
              ...(f.effective_date ? { effective_date: f.effective_date } : {}),
              ...(selected ? { id: { in: selected.map(Number) } } : {})
            },
            orderBy: [
              { effective_date: 'desc' },
              { partner_short_name: 'asc' },
              { product_model: 'asc' },
              { id: 'asc' }
            ],
            take: 100001
          })
        };
      const receivable = source === 'receivable';
      const name = receivable ? f.customer_short_name : f.supplier_short_name;
      const partners = await db.partner.findMany({
        where: {
          type: receivable ? 1 : 0,
          ...(name ? { short_name: { contains: name, mode: 'insensitive' } } : {}),
          ...(selected ? { code: { in: selected.map(String) } } : {})
        },
        select: { code: true, short_name: true }
      });
      if (selected && partners.length !== new Set(selected.map(String)).size) return null;
      const codes = partners.map((p) => p.code);
      const names = new Map(partners.map((p) => [p.code, p.short_name]));
      const transactions = receivable
        ? await db.outboundRecord.findMany({
            where: { customer_code: { in: codes } },
            include: { product: true },
            orderBy: [{ outbound_date: 'desc' }, { id: 'desc' }],
            take: 100001
          })
        : await db.inboundRecord.findMany({
            where: { supplier_code: { in: codes } },
            include: { product: true },
            orderBy: [{ inbound_date: 'desc' }, { id: 'desc' }],
            take: 100001
          });
      const payments = receivable
        ? await db.receivablePayment.findMany({
            where: { customer_code: { in: codes } },
            orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
            take: 100001
          })
        : await db.payablePayment.findMany({
            where: { supplier_code: { in: codes } },
            orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
            take: 100001
          });
      const rows = [
        ...transactions.map((r) => {
          const raw = r as unknown as Record<string, Cell>;
          const code = String(raw[receivable ? 'customer_code' : 'supplier_code']);
          return {
            id: `transaction-${r.id}`,
            partner_code: code,
            partner_name: names.get(code),
            record_type: 'transaction',
            date: raw[receivable ? 'outbound_date' : 'inbound_date'],
            product_model: r.product?.product_model,
            quantity: r.quantity,
            unit_price: r.unit_price,
            total_price: r.total_price,
            transaction_id: r.id,
            payment_id: null,
            payment_date: null,
            remark: r.remark,
            payment_amount: null,
            payment_method: null
          };
        }),
        ...payments.map((r) => {
          const raw = r as unknown as Record<string, Cell>;
          const code = String(raw[receivable ? 'customer_code' : 'supplier_code']);
          return {
            id: `payment-${r.id}`,
            partner_code: code,
            partner_name: names.get(code),
            record_type: 'payment',
            date: null,
            transaction_id: null,
            payment_id: r.id,
            payment_date: r.pay_date,
            remark: r.remark,
            product_model: null,
            quantity: null,
            unit_price: null,
            total_price: null,
            payment_amount: r.amount,
            payment_method: r.pay_method
          };
        })
      ];
      return {
        key: null,
        columns: [
          'id',
          'partner_code',
          'partner_name',
          'record_type',
          'date',
          'product_model',
          'quantity',
          'unit_price',
          'total_price',
          'payment_amount',
          'payment_method'
        ],
        rows
      };
    },
    { isolationLevel: 'RepeatableRead' }
  );
  if (!data || (selected && data.key && data.rows.length !== new Set(selected.map(String)).size)) {
    res.status(409).json({ message: 'Selected records changed. Refresh the table.' });
    return;
  }
  if (data.rows.length > 100000) {
    res.status(422).json({ message: 'Narrow the filters to at most 100000 records.' });
    return;
  }
  const templates = await readExportTemplates();
  const financial = source === 'receivable' || source === 'payable';
  const selectedTemplates = financial
    ? [templates[`${source}_details`], templates[`${source}_payments`]]
    : [templates[source as 'partners' | 'products' | 'prices' | 'inventory']];
  const columns = previewColumns(
    selectedTemplates,
    data.columns,
    financial
      ? {
          record_id: 'transaction_id',
          id: 'payment_id',
          customer_code: 'partner_code',
          supplier_code: 'partner_code',
          customer_short_name: 'partner_name',
          supplier_short_name: 'partner_name',
          outbound_date: 'date',
          inbound_date: 'date',
          pay_date: 'payment_date',
          amount: 'payment_amount',
          pay_method: 'payment_method'
        }
      : {}
  );
  const fieldKeys = [...new Set([...data.columns, ...columns.map((c) => c.key)])];
  const rows = data.rows.map((raw) => {
    const record = { ...raw } as unknown as Record<string, Cell>;
    if (source === 'partners') record['type_name'] = record['type'] === 0 ? 'Supplier' : 'Customer';
    return Object.fromEntries(fieldKeys.map((key) => [key, record[key] ?? null]));
  });
  const id = randomUUID();
  const snapshot: Snapshot = {
    owner: req.user!.username,
    direction: source,
    sheetName: selectedTemplates[0]!.sheetName,
    expiresAt: Date.now() + 86400000,
    columns,
    rows
  };
  await fs.mkdir(resolveFilesInCachePath('export-previews'), { recursive: true });
  await fs.writeFile(snapshotPath(id), JSON.stringify(snapshot), { flag: 'wx' });
  res.json({
    id,
    sheetName: snapshot.sheetName,
    columns,
    rows: rows.slice(0, 50),
    total: rows.length,
    expiresAt: new Date(snapshot.expiresAt).toISOString()
  });
});

router.post('/previews/reports', async (req, res) => {
  const parsed = reportSpec.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid report filters.', issues: parsed.error.issues });
    return;
  }
  const sheets = await prepareReport(parsed.data);
  const total = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  if (total > 100000 || sheets.length > 100) {
    res.status(422).json({ message: 'Narrow the report filters.' });
    return;
  }
  const first = sheets[0]!;
  const id = randomUUID();
  const snapshot: Snapshot = {
    owner: req.user!.username,
    expiresAt: Date.now() + 86400000,
    direction: parsed.data.report,
    sheetName: first.sheetName,
    columns: first.columns,
    rows: first.rows,
    sheets
  };
  await fs.mkdir(resolveFilesInCachePath('export-previews'), { recursive: true });
  await fs.writeFile(snapshotPath(id), JSON.stringify(snapshot), { flag: 'wx' });
  res.json({
    id,
    columns: first.columns,
    rows: first.rows.slice(0, 50),
    total,
    sheets: sheets.map((sheet) => ({
      ...sheet,
      rows: sheet.rows.slice(0, 50),
      total: sheet.rows.length
    }))
  });
});

router.post('/previews/:id/download', async (req, res) => {
  const id = z.uuid().safeParse(req.params['id']);
  const body = z
    .strictObject({
      format: z.enum(['xlsx', 'csv']),
      sheets: z
        .array(
          z.strictObject({
            key: z.string().min(1).max(100),
            columns: z.array(column).min(1).max(100)
          })
        )
        .min(1)
        .max(100)
        .optional(),
      columns: z.array(column).min(1).max(100),
      font: z.enum(['Arial', 'Calibri', 'Microsoft YaHei', 'SimSun']),
      fontSize: z.number().int().min(8).max(36)
    })
    .safeParse(req.body);
  if (!id.success || !body.success) {
    res.status(400).json({ message: 'Invalid export settings.' });
    return;
  }
  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(await fs.readFile(snapshotPath(id.data), 'utf8')) as Snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    res.sendStatus(404);
    return;
  }
  if (snapshot.owner !== req.user!.username) {
    res.sendStatus(404);
    return;
  }
  if (snapshot.expiresAt <= Date.now()) {
    await fs.unlink(snapshotPath(id.data));
    res.status(410).json({ message: 'Preview expired. Refresh the preview.' });
    return;
  }
  const settings = body.data;
  const sourceSheets = snapshot.sheets ?? [
    {
      key: 'default',
      sheetName: snapshot.sheetName ?? snapshot.direction,
      columns: snapshot.columns,
      rows: snapshot.rows
    }
  ];
  const overrides =
    settings.sheets ?? sourceSheets.map((sheet) => ({ key: sheet.key, columns: settings.columns }));
  if (
    overrides.length !== sourceSheets.length ||
    new Set(overrides.map((sheet) => sheet.key)).size !== overrides.length ||
    overrides.some((sheet) => !sourceSheets.some((source) => source.key === sheet.key))
  ) {
    res.status(400).json({ message: 'Invalid export worksheets.' });
    return;
  }
  const resolved = sourceSheets.map((sheet) => ({
    ...sheet,
    columns: overrides.find((override) => override.key === sheet.key)!.columns
  }));
  if (
    resolved.some(
      (sheet) =>
        new Set(sheet.columns.map((c) => c.key)).size !== sheet.columns.length ||
        sheet.columns.some(
          (c) =>
            !sourceSheets
              .find((source) => source.key === sheet.key)!
              .columns.some((allowed) => allowed.key === c.key)
        )
    )
  ) {
    res.status(400).json({ message: 'Invalid export columns.' });
    return;
  }
  if (
    resolved.some((sheet) => !sheet.columns.some((c) => c.visible)) ||
    !resolved.some((sheet) => sheet.rows.length)
  ) {
    res.status(422).json({ message: 'Select at least one column and one record.' });
    return;
  }
  const book = new ExcelJS.Workbook();
  const used = new Set<string>();
  const rendered = resolved.map((source) => {
    const base = safeSheetName(source.sheetName);
    let name = base;
    for (let index = 1; used.has(name.toLowerCase()); index++) {
      const suffix = `_${index}`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    const columns = source.columns.filter((c) => c.visible);
    const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width }));
    source.rows.forEach((row) =>
      sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, row[c.key]])))
    );
    sheet.eachRow((row, index) =>
      row.eachCell((cell) => {
        cell.font = { name: settings.font, size: settings.fontSize, bold: index === 1 };
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (
          typeof cell.value === 'number' &&
          /price/.test(columns[Number(cell.col) - 1]?.key ?? '')
        )
          cell.numFmt = '#,##0.00';
      })
    );
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return { ...source, sheetName: name, columns };
  });
  const csvCell = (value: Cell | undefined) => {
    let s = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+\-@\t\r\n]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const csv = (sheet: (typeof rendered)[number]) =>
    Buffer.from(
      '\uFEFF' +
        [
          sheet.columns.map((c) => csvCell(c.label)).join(','),
          ...sheet.rows.map((row) => sheet.columns.map((c) => csvCell(row[c.key])).join(','))
        ].join('\r\n')
    );
  const zipped = settings.format === 'csv' && rendered.length > 1;
  const buffer =
    settings.format === 'xlsx'
      ? Buffer.from(await book.xlsx.writeBuffer())
      : zipped
        ? Buffer.from(
            zipSync(
              Object.fromEntries(rendered.map((sheet) => [sheet.sheetName + '.csv', csv(sheet)]))
            )
          )
        : csv(rendered[0]!);
  res.setHeader(
    'Content-Type',
    settings.format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : zipped
        ? 'application/zip'
        : 'text/csv; charset=utf-8'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${snapshot.direction}.${zipped ? 'zip' : settings.format}"`
  );
  res.send(buffer);
});
export default router;
