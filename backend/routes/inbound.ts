import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient.js';
import { Prisma } from '@prisma/client';
import decimalCalc from '@/utils/decimalCalculator.js';

const router: Router = express.Router();

function isProvided(val: any): boolean {
  return !(val === undefined || val === null || val === '' || val === 'null' || val === 'undefined');
}

/**
 * GET /api/inbound
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    let { page = 1 } = req.query;
    let pageNum = parseInt(page as string, 10);
    if (!Number.isFinite(pageNum) || pageNum < 1) pageNum = 1;
    const limit = 10;
    const skip = (pageNum - 1) * limit;
    
    const where: Prisma.InboundRecordWhereInput = {};
    
    if (isProvided(req.query['supplier_short_name'])) {
      where.supplier_short_name = { contains: req.query['supplier_short_name'] as string };
    }
    if (isProvided(req.query['product_model'])) {
      where.product_model = { contains: req.query['product_model'] as string };
    }
    if (isProvided(req.query['start_date'])) {
      where.inbound_date = { gte: req.query['start_date'] as string };
    }
    if (isProvided(req.query['end_date'])) {
      where.inbound_date = { lte: req.query['end_date'] as string };
    }

    const sortField = req.query['sort_field'] as string;
    const allowedSortFields = ['inbound_date', 'unit_price', 'total_price', 'id'];
    let orderBy: Prisma.InboundRecordOrderByWithRelationInput = { id: 'desc' };

    if (sortField && allowedSortFields.includes(sortField)) {
        const fieldMap: Record<string, keyof Prisma.InboundRecordOrderByWithRelationInput> = {
            'inbound_date': 'inbound_date',
            'unit_price': 'unit_price',
            'total_price': 'total_price',
            'id': 'id'
        };
        const prismaField = fieldMap[sortField];
        const sortOrder = req.query['sort_order'] && (req.query['sort_order'] as string).toLowerCase() === 'asc' ? 'asc' : 'desc';
        // Need to cast the dynamic object structure for TypeScript
        if (prismaField) {
          orderBy = { [prismaField]: sortOrder } as Prisma.InboundRecordOrderByWithRelationInput; 
        } 
    }

    const [rows, total] = await prisma.$transaction([
        prisma.inboundRecord.findMany({
            where,
            orderBy,
            skip,
            take: limit
        }),
        prisma.inboundRecord.count({ where })
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
 * POST /api/inbound
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      supplier_code, supplier_short_name, supplier_full_name, 
      product_code, product_model, quantity, unit_price,
      inbound_date, invoice_date, invoice_number, receipt_number, order_number,
      remark
    } = req.body;

    const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);
    
    const result = await prisma.inboundRecord.create({
        data: {
          supplier_code,
          supplier_short_name,
          supplier_full_name,
          product_code,
          product_model,
          quantity,
          unit_price,
          total_price,
          inbound_date,
          invoice_date,
          invoice_number,
          receipt_number,
          order_number,
          remark
        }
    });
    
    res.json({ id: result.id, message: 'Inbound record created!' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/inbound/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params['id']);
    
    const {
      supplier_code, supplier_short_name, supplier_full_name, 
      product_code, product_model, quantity, unit_price,
      inbound_date, invoice_date, invoice_number, receipt_number, order_number,
      remark
    } = req.body;
    
    const total_price = decimalCalc.calculateTotalPrice(quantity, unit_price);
    
    await prisma.inboundRecord.update({
        where: { id },
        data: {
          supplier_code,
          supplier_short_name,
          supplier_full_name,
          product_code,
          product_model,
          quantity,
          unit_price,
          total_price,
          inbound_date,
          invoice_date,
          invoice_number,
          receipt_number,
          order_number,
          remark
        }
    });
    
    res.json({ message: 'Inbound record updated!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'No inbound records exist' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/inbound/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params['id']);
    
    await prisma.inboundRecord.delete({ where: { id } });
    
    res.json({ message: 'Inbound record deleted!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'No inbound records exist' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/inbound/batch
 * Batch update multiple inbound records
 */
router.post('/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, updates } = req.body;
    
    // Validate request
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required and must not be empty' });
      return;
    }
    
    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'updates object is required' });
      return;
    }
    
    const allowedFieldsMap: Record<string, keyof Prisma.InboundRecordUpdateInput> = {
      'supplier_code': 'supplier_code',
      'supplier_short_name': 'supplier_short_name',
      'supplier_full_name': 'supplier_full_name',
      'product_code': 'product_code',
      'product_model': 'product_model',
      'quantity': 'quantity',
      'unit_price': 'unit_price',
      'inbound_date': 'inbound_date',
      'invoice_date': 'invoice_date',
      'invoice_number': 'invoice_number',
      'receipt_number': 'receipt_number',
      'order_number': 'order_number',
      'remark': 'remark'
    };
    
    // Prepare base update object
    const updateData: Prisma.InboundRecordUpdateInput = {};
    let hasQuantity = false;
    let hasUnitPrice = false;

    for (const [key, val] of Object.entries(updates)) {
        if (allowedFieldsMap[key] && isProvided(val)) {
            // @ts-ignore - dynamic assignment
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

    // Transactions per record might be safer to track individual success/failure
    // But REST API usually implies all-or-nothing or partial-ok report. 
    // The original code tried to update one by one and collected errors.
    
    // We can't use updateMany easily if recalculation is needed per row dependent on its own values.
    // So we iterate.
    
    for (const recordId of ids) {
        try {
            if (needsRecalculation) {
                // Fetch current first
                const current = await prisma.inboundRecord.findUnique({ where: { id: recordId }, select: { quantity: true, unit_price: true } });
                if (!current) {
                    notFound.push(recordId);
                    continue;
                }
                
                const finalQuantity = hasQuantity ? updates.quantity : current.quantity;
                const finalUnitPrice = hasUnitPrice ? updates.unit_price : current.unit_price;
                const total_price = decimalCalc.calculateTotalPrice(finalQuantity, finalUnitPrice);
                
                await prisma.inboundRecord.update({
                    where: { id: recordId },
                    data: {
                        ...updateData,
                        total_price: total_price
                    }
                });
                completed++;
            } else {
                // No calc needed
                 await prisma.inboundRecord.update({
                    where: { id: recordId },
                    data: updateData
                });
                completed++;
            }
        } catch (e: any) {
            if (e.code === 'P2025') {
                 notFound.push(recordId);
            } else {
                 errors++;
            }
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
