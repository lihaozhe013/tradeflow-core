import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient.js';
import { Prisma } from '@prisma/client';
import decimalCalc from '@/utils/decimalCalculator.js';

const router: Router = express.Router();

function isProvided(val: any): boolean {
  return !(val === undefined || val === null || val === '' || val === 'null' || val === 'undefined');
}

/**
 * GET /api/outbound
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    let { page = 1 } = req.query;
    let pageNum = parseInt(page as string, 10);
    if (!Number.isFinite(pageNum) || pageNum < 1) pageNum = 1;
    const limit = 10;
    const skip = (pageNum - 1) * limit;
    
    const where: Prisma.OutboundRecordWhereInput = {};
    
    if (isProvided(req.query['customer_short_name'])) {
      where.customer_short_name = { contains: req.query['customer_short_name'] as string };
    }
    if (isProvided(req.query['product_model'])) {
      where.product_model = { contains: req.query['product_model'] as string };
    }
    if (isProvided(req.query['start_date'])) {
      where.outbound_date = { gte: req.query['start_date'] as string };
    }
    if (isProvided(req.query['end_date'])) {
      where.outbound_date = { lte: req.query['end_date'] as string };
    }

    const sortField = req.query['sort_field'] as string;
    const allowedSortFields = ['outbound_date', 'unit_price', 'total_price', 'id'];
    let orderBy: Prisma.OutboundRecordOrderByWithRelationInput = { id: 'desc' }; // Default

    if (sortField && allowedSortFields.includes(sortField)) {
        const fieldMap: Record<string, keyof Prisma.OutboundRecordOrderByWithRelationInput> = {
            'outbound_date': 'outbound_date',
            'unit_price': 'unit_price',
            'total_price': 'total_price',
            'id': 'id'
        };
        const prismaField = fieldMap[sortField];
        const sortOrder = req.query['sort_order'] && (req.query['sort_order'] as string).toLowerCase() === 'asc' ? 'asc' : 'desc';
        if (prismaField) {
            orderBy = { [prismaField]: sortOrder } as Prisma.OutboundRecordOrderByWithRelationInput; 
        } 
    }

    const [rows, total] = await prisma.$transaction([
        prisma.outboundRecord.findMany({ where, orderBy, skip, take: limit }),
        prisma.outboundRecord.count({ where })
    ]);
    
    // Rows are already in snake_case

    res.json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/outbound
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      customer_code, customer_short_name, customer_full_name, 
      product_code, product_model, quantity, unit_price,
      outbound_date, invoice_date, invoice_number, receipt_number, order_number,
      remark
    } = req.body;
  
    const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);
    
    const result = await prisma.outboundRecord.create({
        data: {
          customer_code,
          customer_short_name,
          customer_full_name,
          product_code,
          product_model,
          quantity,
          unit_price,
          total_price,
          outbound_date,
          invoice_date,
          invoice_number,
          receipt_number,
          order_number,
          remark
        }
    });
    
    res.json({ id: result.id, message: 'Outbound record created!' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/outbound/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params['id']);
    const {
      customer_code, customer_short_name, customer_full_name, 
      product_code, product_model, quantity, unit_price,
      outbound_date, invoice_date, invoice_number, receipt_number, order_number,
      remark
    } = req.body;
  
    const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);
    
    await prisma.outboundRecord.update({
        where: { id },
        data: {
          customer_code,
          customer_short_name,
          customer_full_name,
          product_code,
          product_model,
          quantity,
          unit_price,
          total_price,
          outbound_date,
          invoice_date,
          invoice_number,
          receipt_number,
          order_number,
          remark
        }
    });
    
    res.json({ message: 'Outbound record updated!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'No outbound records exist' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/outbound/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params['id']);
    
    await prisma.outboundRecord.delete({ where: { id } });
    
    res.json({ message: 'Outbound record deleted!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'No outbound records exist' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
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
  const allowedFieldsMap: Record<string, keyof Prisma.OutboundRecordUpdateInput> = {
    'customer_code': 'customer_code',
    'customer_short_name': 'customer_short_name',
    'customer_full_name': 'customer_full_name',
    'product_code': 'product_code',
    'product_model': 'product_model',
    'quantity': 'quantity',
    'unit_price': 'unit_price',
    'outbound_date': 'outbound_date',
    'invoice_date': 'invoice_date',
    'invoice_number': 'invoice_number',
    'receipt_number': 'receipt_number',
    'order_number': 'order_number',
    'remark': 'remark'
  };

  const updateData: Prisma.OutboundRecordUpdateInput = {};
  let hasQuantity = false;
  let hasUnitPrice = false;

  for (const [key, val] of Object.entries(updates)) {
      if (allowedFieldsMap[key] && isProvided(val)) {
           // @ts-ignore
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

  try {
    // Iterate batch updates
    for (const recordId of ids) {
         try {
            if (needsRecalculation) {
                const current = await prisma.outboundRecord.findUnique({ where: { id: recordId }, select: { quantity: true, unit_price: true } });
                if (!current) {
                    notFound.push(recordId);
                    continue;
                }
                const finalQuantity = hasQuantity ? updates.quantity : current.quantity;
                const finalUnitPrice = hasUnitPrice ? updates.unit_price : current.unit_price;
                const total_price = decimalCalc.calculateTotalPrice(finalQuantity, finalUnitPrice);

                await prisma.outboundRecord.update({
                    where: { id: recordId },
                    data: { ...updateData, total_price: total_price }
                });
                completed++;
            } else {
                 await prisma.outboundRecord.update({
                    where: { id: recordId },
                    data: updateData
                });
                completed++;
            }
         } catch (e: any) {
             if (e.code === 'P2025') notFound.push(recordId);
             else errors++;
         }
    }
    
    res.json({
      message: 'Batch update completed!',
      updated: completed,
      notFound: notFound,
      errors: errors
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

export default router;
