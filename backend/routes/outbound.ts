import { Hono } from 'hono';
import { prisma } from '@/prismaClient';
import { Prisma } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import { pagination_limit } from '@/utils/paths';
import { inventoryService } from '@/utils/inventoryService';
import { listTransactions } from '@/services/readService';
import { createOutboundRecord } from '@/services/transactionWriteService';
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
 * GET /api/outbound
 */
app.get('/', async (c) => {
  const pageParam = c.req.query('page') ?? '1';
  let page = parseInt(pageParam, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const allowedSortFields = ['outbound_date', 'unit_price', 'total_price', 'id'];
  const requestedSort = c.req.query('sort_field');
  const result = await listTransactions(prisma, {
    direction: 'outbound',
    page,
    limit: pagination_limit,
    partnerShortName: isProvided(c.req.query('customer_short_name'))
      ? c.req.query('customer_short_name')
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
 * POST /api/outbound
 */
app.post('/', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const {
    customer_code,
    product_code,
    quantity,
    unit_price,
    outbound_date,
    invoice_date,
    invoice_number,
    receipt_number,
    order_number,
    remark
  } = body;

  const result = await prisma.$transaction((tx) =>
    createOutboundRecord(tx, {
      customer_code,
      product_code,
      quantity,
      unit_price,
      outbound_date,
      invoice_date,
      invoice_number,
      receipt_number,
      order_number,
      remark
    })
  );
  return c.json({ id: result.id, message: 'Outbound record created!' });
});

/**
 * PUT /api/outbound/:id
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
    customer_code,
    product_code,
    quantity,
    unit_price,
    outbound_date,
    invoice_date,
    invoice_number,
    receipt_number,
    order_number,
    remark
  } = body;

  const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);
  const oldRecord = await prisma.outboundRecord.findUnique({
    where: { id },
    include: { product: true }
  });
  if (!oldRecord) {
    return c.json({ error: 'No outbound records exist' }, 404);
  }
  const result = await prisma.outboundRecord.update({
    where: { id },
    data: {
      customer_code,
      product_code,
      quantity,
      unit_price,
      total_price,
      outbound_date,
      invoice_date,
      invoice_number,
      receipt_number,
      order_number,
      remark
    },
    include: { product: true }
  });
  await inventoryService.onOutboundUpdate(oldRecord, result);
  return c.json({ message: 'Outbound record updated!' });
});

/**
 * DELETE /api/outbound/:id
 */
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await prisma.outboundRecord.delete({ where: { id } });
  await inventoryService.onOutboundDelete(id);
  return c.json({ message: 'Outbound record deleted!' });
});

/**
 * POST /api/outbound/batch
 * Batch update multiple outbound records
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

  const allowedFieldsMap: Record<string, keyof Prisma.OutboundRecordUncheckedUpdateInput> = {
    customer_code: 'customer_code',
    product_code: 'product_code',
    quantity: 'quantity',
    unit_price: 'unit_price',
    outbound_date: 'outbound_date',
    invoice_date: 'invoice_date',
    invoice_number: 'invoice_number',
    receipt_number: 'receipt_number',
    order_number: 'order_number',
    remark: 'remark'
  };

  const updateData: Prisma.OutboundRecordUpdateInput = {};
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
  let errors = 0;
  const notFound: number[] = [];

  for (const recordId of ids) {
    try {
      const oldRecord = await prisma.outboundRecord.findUnique({
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

        result = await prisma.outboundRecord.update({
          where: { id: recordId },
          data: {
            ...updateData,
            total_price: total_price
          },
          include: { product: true }
        });
      } else {
        result = await prisma.outboundRecord.update({
          where: { id: recordId },
          data: updateData,
          include: { product: true }
        });
      }

      await inventoryService.onOutboundUpdate(oldRecord, result);
      completed++;
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        notFound.push(recordId);
      } else {
        errors++;
      }
    }
  }

  return c.json({
    message: 'Batch update completed!',
    updated: completed,
    notFound: notFound,
    errors: errors
  });
});

export default app;
