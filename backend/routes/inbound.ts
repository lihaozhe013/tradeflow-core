import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import { pagination_limit } from '@/utils/paths';
import { inventoryService } from '@/utils/inventoryService';
import { listTransactions } from '@/services/readService';

const router: Router = express.Router();

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

// Query params are untrusted: only accept single string values, trimmed and length-capped.
function numberFilterValue(val: unknown): string {
  if (!isProvided(val) || typeof val !== 'string') return '';
  return val.trim().slice(0, NUMBER_FILTER_MAX_LENGTH);
}

/**
 * GET /api/inbound
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const pageParam = req.query['page'] ?? '1';
  let page = parseInt(pageParam as string, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const allowedSortFields = ['inbound_date', 'unit_price', 'total_price', 'id'];
  const requestedSort = req.query['sort_field'] as string | undefined;
  const result = await listTransactions(prisma, {
    direction: 'inbound',
    page,
    limit: pagination_limit,
    partnerShortName: isProvided(req.query['supplier_short_name'])
      ? (req.query['supplier_short_name'] as string)
      : undefined,
    productModel: isProvided(req.query['product_model'])
      ? (req.query['product_model'] as string)
      : undefined,
    startDate: isProvided(req.query['start_date'])
      ? (req.query['start_date'] as string)
      : undefined,
    endDate: isProvided(req.query['end_date']) ? (req.query['end_date'] as string) : undefined,
    keyword: numberFilterValue(req.query['keyword']) || undefined,
    orderNumber: numberFilterValue(req.query['order_number']) || undefined,
    invoiceNumber: numberFilterValue(req.query['invoice_number']) || undefined,
    receiptNumber: numberFilterValue(req.query['receipt_number']) || undefined,
    sortField:
      requestedSort && allowedSortFields.includes(requestedSort) ? requestedSort : undefined,
    sortOrder:
      (req.query['sort_order'] as string | undefined)?.toLowerCase() === 'asc' ? 'asc' : 'desc'
  });
  const rows = result.data.map((row) => ({
    ...row,
    product_model: row.product?.product_model || null
  }));

  res.json({
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
router.post('/', async (req: Request, res: Response): Promise<void> => {
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
  } = req.body;

  const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);

  const result = await prisma.inboundRecord.create({
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

  await inventoryService.onInboundCreate(result);
  res.json({ id: result.id, message: 'Inbound record created!' });
});

/**
 * PUT /api/inbound/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
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
  } = req.body;

  const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);
  const oldRecord = await prisma.inboundRecord.findUnique({
    where: { id },
    include: { product: true }
  });
  if (!oldRecord) {
    res.status(404).json({ error: 'No inbound records exist' });
    return;
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
  res.json({ message: 'Inbound record updated!' });
});

/**
 * DELETE /api/inbound/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  await prisma.inboundRecord.delete({ where: { id } });
  await inventoryService.onInboundDelete(id);
  res.json({ message: 'Inbound record deleted!' });
});

/**
 * POST /api/inbound/batch
 * Batch update multiple inbound records
 */
router.post('/batch', async (req: Request, res: Response): Promise<void> => {
  const { ids, updates } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids array is required and must not be empty' });
    return;
  }

  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'updates object is required' });
    return;
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

  // Prepare base update object
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
    res.status(400).json({ error: 'No valid update fields provided' });
    return;
  }

  const needsRecalculation = hasQuantity || hasUnitPrice;
  let completed = 0;
  const notFound: number[] = [];

  // Transactions per record might be safer to track individual success/failure
  // But REST API usually implies all-or-nothing or partial-ok report.
  // The original code tried to update one by one and collected errors.

  // We can't use updateMany easily if recalculation is needed per row dependent on its own values.
  // So we iterate.

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
      // We have oldRecord, so we can use its values safely
      const quantity = oldRecord.quantity ?? 0;
      const unitPrice = oldRecord.unit_price ?? 0;

      // Assuming updates object has correct types or casting as needed
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

  res.json({
    message: 'Batch update completed!',
    updated: completed,
    notFound: notFound
  });
});

export default router;
