import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient';
import { Prisma } from '@/prisma/client';
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
 * GET /api/outbound
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const pageParam = req.query['page'] ?? '1';
  let page = parseInt(pageParam as string, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const allowedSortFields = ['outbound_date', 'unit_price', 'total_price', 'id'];
  const requestedSort = req.query['sort_field'] as string | undefined;
  const result = await listTransactions(prisma, {
    direction: 'outbound',
    page,
    limit: pagination_limit,
    partnerShortName: isProvided(req.query['customer_short_name'])
      ? (req.query['customer_short_name'] as string)
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
 * POST /api/outbound
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
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
  } = req.body;

  const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);

  const result = await prisma.outboundRecord.create({
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

  await inventoryService.onOutboundCreate(result);

  res.json({ id: result.id, message: 'Outbound record created!' });
});

/**
 * PUT /api/outbound/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
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
  } = req.body;

  const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);

  const oldRecord = await prisma.outboundRecord.findUnique({
    where: { id },
    include: { product: true }
  });
  if (!oldRecord) {
    res.status(404).json({ error: 'No outbound records exist' });
    return;
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

  res.json({ message: 'Outbound record updated!' });
});

/**
 * DELETE /api/outbound/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  await prisma.outboundRecord.delete({ where: { id } });
  await inventoryService.onOutboundDelete(id);
  res.json({ message: 'Outbound record deleted!' });
});

/**
 * POST /api/outbound/batch
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

  // Mapping
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
    res.status(400).json({ error: 'No valid update fields provided' });
    return;
  }

  const needsRecalculation = hasQuantity || hasUnitPrice;
  let completed = 0;
  let errors = 0;
  const notFound: number[] = [];

  // Iterate batch updates
  for (const recordId of ids) {
    try {
      if (needsRecalculation) {
        const oldRecord = await prisma.outboundRecord.findUnique({
          where: { id: recordId },
          include: { product: true }
        });
        if (!oldRecord) {
          notFound.push(recordId);
          continue;
        }

        const quantity = oldRecord.quantity ?? 0;
        const unitPrice = oldRecord.unit_price ?? 0;
        const finalQuantity = hasQuantity ? (updates.quantity as number) : quantity;
        const finalUnitPrice = hasUnitPrice ? (updates.unit_price as number) : unitPrice;
        const total_price = decimalCalc.calculateTotalPrice(finalQuantity, finalUnitPrice);

        const result = await prisma.outboundRecord.update({
          where: { id: recordId },
          data: { ...updateData, total_price: total_price },
          include: { product: true }
        });

        await inventoryService.onOutboundUpdate(oldRecord, result);
        completed++;
      } else {
        const oldRecord = await prisma.outboundRecord.findUnique({
          where: { id: recordId },
          include: { product: true }
        });
        if (!oldRecord) {
          notFound.push(recordId); // unlikely if we are here?
          continue; // or handle error
        }
        const result = await prisma.outboundRecord.update({
          where: { id: recordId },
          data: updateData,
          include: { product: true }
        });
        await inventoryService.onOutboundUpdate(oldRecord, result);
        completed++;
      }
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025')
        notFound.push(recordId);
      else errors++;
    }
  }

  res.json({
    message: 'Batch update completed!',
    updated: completed,
    notFound: notFound,
    errors: errors
  });
});

export default router;
