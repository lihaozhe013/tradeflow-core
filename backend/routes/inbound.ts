import { Hono } from 'hono';
import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import { pagination_limit } from '@/utils/paths';
import { inventoryService } from '@/utils/inventoryService';
import { listTransactions } from '@/services/readService';
import { createInboundRecord } from '@/services/transactionWriteService';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

function isProvided(val: unknown): boolean {
  return !(
    val === undefined ||
    val === null ||
    val === '' ||
    val === 'null' ||
    val === 'undefined'
  );
}

const NUMBER_FILTER_MAX_LENGTH = 100;

function numberFilterValue(val: unknown): string {
  if (!isProvided(val) || typeof val !== 'string') return '';
  return val.trim().slice(0, NUMBER_FILTER_MAX_LENGTH);
}

/**
 * GET /api/inbound
 */
app.get('/', async (c) => {
  const pageParam = c.req.query('page') ?? '1';
  let page = parseInt(pageParam, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const allowedSortFields = ['inbound_date', 'unit_price', 'total_price', 'id'];
  const requestedSort = c.req.query('sort_field');
  const result = await listTransactions(prisma, {
    direction: 'inbound',
    page,
    limit: pagination_limit,
    partnerShortName: isProvided(c.req.query('supplier_short_name'))
      ? c.req.query('supplier_short_name')
      : undefined,
    productModel: isProvided(c.req.query('product_model'))
      ? c.req.query('product_model')
      : undefined,
    startDate: isProvided(c.req.query('start_date')) ? c.req.query('start_date') : undefined,
    endDate: isProvided(c.req.query('end_date')) ? c.req.query('end_date') : undefined,
    keyword: numberFilterValue(c.req.query('keyword')) || undefined,
    orderNumber: numberFilterValue(c.req.query('order_number')) || undefined,
    invoiceNumber: numberFilterValue(c.req.query('invoice_number')) || undefined,
    receiptNumber: numberFilterValue(c.req.query('receipt_number')) || undefined,
    sortField:
      requestedSort && allowedSortFields.includes(requestedSort) ? requestedSort : undefined,
    sortOrder: c.req.query('sort_order')?.toLowerCase() === 'asc' ? 'asc' : 'desc'
  });
  const rows = result.data.map((row) => ({
    ...row,
    product_model: row.product?.product_model || null
  }));

  return c.json({
    data: rows,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages
    }
  });
});

/**
 * POST /api/inbound
 */
app.post('/', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const {
    supplier_code,
    product_code,
    quantity,
    unit_price,
    inbound_date,
    invoice_date,
    invoice_number,
    receipt_number,
    order_number,
    remark
  } = body;

  const result = await prisma.$transaction((tx) =>
    createInboundRecord(tx, {
      supplier_code,
      product_code,
      quantity,
      unit_price,
      inbound_date,
      invoice_date,
      invoice_number,
      receipt_number,
      order_number,
      remark
    })
  );
  return c.json({ id: result.id, message: 'Inbound record created!' });
});

/**
 * PUT /api/inbound/:id
 */
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const {
    supplier_code,
    product_code,
    quantity,
    unit_price,
    inbound_date,
    invoice_date,
    invoice_number,
    receipt_number,
    order_number,
    remark
  } = body;

  const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);
  const oldRecord = await prisma.inboundRecord.findUnique({
    where: { id },
    include: { product: true }
  });
  if (!oldRecord) {
    return c.json({ error: 'No inbound records exist' }, 404);
  }
  const result = await prisma.inboundRecord.update({
    where: { id },
    data: {
      supplier_code,
      product_code,
      quantity,
      unit_price,
      total_price,
      inbound_date,
      invoice_date,
      invoice_number,
      receipt_number,
      order_number,
      remark
    },
    include: { product: true }
  });
  await inventoryService.onInboundUpdate(oldRecord, result);
  return c.json({ message: 'Inbound record updated!' });
});

/**
 * DELETE /api/inbound/:id
 */
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await prisma.inboundRecord.delete({ where: { id } });
  await inventoryService.onInboundDelete(id);
  return c.json({ message: 'Inbound record deleted!' });
});

/**
 * POST /api/inbound/batch
 * Batch update multiple inbound records
 */
app.post('/batch', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { ids, updates } = body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids array is required and must not be empty' }, 400);
  }

  if (!updates || typeof updates !== 'object') {
    return c.json({ error: 'updates object is required' }, 400);
  }

  const allowedFieldsMap: Record<string, keyof Prisma.InboundRecordUncheckedUpdateInput> = {
    supplier_code: 'supplier_code',
    product_code: 'product_code',
    quantity: 'quantity',
    unit_price: 'unit_price',
    inbound_date: 'inbound_date',
    invoice_date: 'invoice_date',
    invoice_number: 'invoice_number',
    receipt_number: 'receipt_number',
    order_number: 'order_number',
    remark: 'remark'
  };

  const updateData: Prisma.InboundRecordUpdateInput = {};
  let hasQuantity = false;
  let hasUnitPrice = false;

  for (const [key, val] of Object.entries(updates)) {
    if (allowedFieldsMap[key] && isProvided(val)) {
      // @ts-expect-error - dynamic assignment
      updateData[allowedFieldsMap[key]] = val;
      if (key === 'quantity') hasQuantity = true;
      if (key === 'unit_price') hasUnitPrice = true;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: 'No valid update fields provided' }, 400);
  }

  const needsRecalculation = hasQuantity || hasUnitPrice;
  let completed = 0;
  const notFound: number[] = [];

  for (const recordId of ids) {
    const oldRecord = await prisma.inboundRecord.findUnique({
      where: { id: recordId },
      include: { product: true }
    });
    if (!oldRecord) {
      notFound.push(recordId);
      continue;
    }

    let result;
    if (needsRecalculation) {
      const quantity = oldRecord.quantity ?? 0;
      const unitPrice = oldRecord.unit_price ?? 0;

      const finalQuantity = hasQuantity ? (updates.quantity as number) : quantity;
      const finalUnitPrice = hasUnitPrice ? (updates.unit_price as number) : unitPrice;
      const total_price = decimalCalc.calculateTotalPrice(finalQuantity, finalUnitPrice);

      result = await prisma.inboundRecord.update({
        where: { id: recordId },
        data: {
          ...updateData,
          total_price: total_price
        },
        include: { product: true }
      });
    } else {
      result = await prisma.inboundRecord.update({
        where: { id: recordId },
        data: updateData,
        include: { product: true }
      });
    }

    await inventoryService.onInboundUpdate(oldRecord, result);
    completed++;
  }

  return c.json({
    message: 'Batch update completed!',
    updated: completed,
    notFound: notFound
  });
});

export default app;
