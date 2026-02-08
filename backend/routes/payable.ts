import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient.js';
import { Prisma } from '@prisma/client';
import decimalCalc from '@/utils/decimalCalculator.js';
import invoiceCacheService from '@/utils/invoiceCacheService.js';

const router: Router = express.Router();

interface PayableRow {
  supplier_code: string;
  supplier_short_name: string;
  supplier_full_name: string;
  total_payable: number;
  total_paid: number;
  balance: number;
  last_payment_date: string | null;
  last_payment_method: string | null;
  payment_count: number;
}

/**
 * GET /api/payable
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { page = 1, limit = 10, supplier_short_name, sort_field = 'balance', sort_order = 'desc' } = req.query;
  
  let whereClause = "WHERE p.type = 0";
  
  if (supplier_short_name) {
    const sanitizedVal = String(supplier_short_name).replace(/'/g, "''");
    whereClause += ` AND p.short_name LIKE '%${sanitizedVal}%'`;
  }

  const allowedSortFields = ['supplier_code', 'supplier_short_name', 'total_payable', 'total_paid', 'balance', 'last_payment_date'];
  let orderBy = 'balance DESC';
  if (sort_field && allowedSortFields.includes(sort_field as string)) {
    const sortOrderStr = sort_order && (sort_order as string).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    orderBy = `${sort_field} ${sortOrderStr}`;
  }

  const offset = (Number(page) - 1) * Number(limit);

  const sql = `
    SELECT
      p.code AS supplier_code,
      p.short_name AS supplier_short_name,
      p.full_name AS supplier_full_name,
      COALESCE(i.total_payable, 0) AS total_payable,
      COALESCE(pp.total_paid, 0) AS total_paid,
      COALESCE(i.total_payable, 0) - COALESCE(pp.total_paid, 0) AS balance,
      pp.last_payment_date,
      pp.last_payment_method,
      pp.payment_count
    FROM partners p
    LEFT JOIN (
      SELECT supplier_code, SUM(total_price) AS total_payable
      FROM inbound_records
      GROUP BY supplier_code
    ) i ON p.code = i.supplier_code
    LEFT JOIN (
      SELECT supplier_code, SUM(amount) AS total_paid, MAX(pay_date) AS last_payment_date, MAX(pay_method) AS last_payment_method, COUNT(*) AS payment_count
      FROM payable_payments
      GROUP BY supplier_code
    ) pp ON p.code = pp.supplier_code
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${Number(limit)} OFFSET ${offset}
  `;

  try {
    const rows = await prisma.$queryRawUnsafe<PayableRow[]>(sql);

    const processedRows = rows.map(row => {
      const totalPayable = decimalCalc.fromSqlResult(row.total_payable, 0);
      const totalPaid = decimalCalc.fromSqlResult(row.total_paid, 0);
      const balance = decimalCalc.calculateBalance(totalPayable, totalPaid);
      
      // Convert BigInt to Number for payment_count
      const paymentCount = row.payment_count ? Number(row.payment_count) : 0;

      return {
        ...row,
        total_payable: totalPayable,
        total_paid: totalPaid,
        balance: balance,
        payment_count: paymentCount
      };
    });

    const where: Prisma.PartnerWhereInput = { type: 0 };
    if (supplier_short_name) {
      where.short_name = { contains: supplier_short_name as string };
    }
    const total = await prisma.partner.count({ where });
    
    res.json({
      data: processedRows,
      total: total,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payable/payments/:supplier_code
 */
router.get('/payments/:supplier_code', async (req: Request, res: Response): Promise<void> => {
  const supplier_code = req.params['supplier_code'] as string;
  const { page = 1, limit = 10 } = req.query;
  
  const skip = (Number(page) - 1) * Number(limit);
  
  try {
    const [rows, total] = await prisma.$transaction([
      prisma.payablePayment.findMany({
        where: { supplier_code },
        orderBy: { pay_date: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.payablePayment.count({ where: { supplier_code } })
    ]);
    
    res.json({
      data: rows,
      total,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payable/payments
 */
router.post('/payments', async (req: Request, res: Response): Promise<void> => {
  const { supplier_code, amount, pay_date, pay_method, remark } = req.body;
  
  if (!supplier_code || amount === undefined || !pay_date) {
    res.status(400).json({ error: 'Supplier ID, payment amount, and payment date are required fields' });
    return;
  }
  
  try {
    const result = await prisma.payablePayment.create({
      data: {
        supplier_code,
        amount,
        pay_date,
        pay_method: pay_method || '',
        remark: remark || ''
      }
    });
    res.json({ id: result.id, message: 'Payment record created!' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/payable/payments/:id
 */
router.put('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  const { supplier_code, amount, pay_date, pay_method, remark } = req.body;
  
  if (!supplier_code || amount === undefined || !pay_date) {
    res.status(400).json({ error: 'Supplier ID, payment amount, and payment date are required fields' });
    return;
  }
  
  try {
    await prisma.payablePayment.update({
      where: { id },
      data: {
        supplier_code,
        amount,
        pay_date,
        pay_method: pay_method || '',
        remark: remark || ''
      }
    });
    
    res.json({ message: 'Payment record updated!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'Payement record dne' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/payable/payments/:id
 */
router.delete('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params['id']);
    
    await prisma.payablePayment.delete({ where: { id } });
    
    res.json({ message: 'Payment record deleted!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'Payment record dne' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payable/details/:supplier_code
 */
router.get('/details/:supplier_code', async (req: Request, res: Response): Promise<void> => {
  const supplier_code = req.params['supplier_code'] as string;
  const { 
    inbound_page = 1, 
    inbound_limit = 10, 
    payment_page = 1, 
    payment_limit = 10 
  } = req.query;

  try {
    const supplier = await prisma.partner.findFirst({
      where: { code: supplier_code, type: 0 }
    });

    if (!supplier) {
      res.status(404).json({ error: 'Supplier dne' });
      return;
    }

    const inboundSkip = (Number(inbound_page) - 1) * Number(inbound_limit);
    const paymentSkip = (Number(payment_page) - 1) * Number(payment_limit);

    const [
      inboundRecords,
      inboundCount,
      paymentRecords,
      paymentCount,
      inboundAgg,
      paymentAgg
    ] = await Promise.all([
      prisma.inboundRecord.findMany({
        where: { supplier_code },
        orderBy: { inbound_date: 'desc' },
        skip: inboundSkip,
        take: Number(inbound_limit)
      }),
      prisma.inboundRecord.count({ where: { supplier_code } }),
      prisma.payablePayment.findMany({
        where: { supplier_code },
        orderBy: { pay_date: 'desc' },
        skip: paymentSkip,
        take: Number(payment_limit)
      }),
      prisma.payablePayment.count({ where: { supplier_code } }),
      prisma.inboundRecord.aggregate({
        where: { supplier_code },
        _sum: { total_price: true }
      }),
      prisma.payablePayment.aggregate({
        where: { supplier_code },
        _sum: { amount: true }
      })
    ]);

    const totalPayable = decimalCalc.fromSqlResult(inboundAgg._sum?.total_price || 0, 0);
    const totalPaid = decimalCalc.fromSqlResult(paymentAgg._sum?.amount || 0, 0);
    const balance = decimalCalc.calculateBalance(totalPayable, totalPaid);
    
    res.json({
      supplier,
      summary: {
        total_payable: totalPayable,
        total_paid: totalPaid,
        balance: balance
      },
      inbound_records: {
        data: inboundRecords,
        total: inboundCount,
        page: Number(inbound_page),
        limit: Number(inbound_limit)
      },
      payment_records: {
        data: paymentRecords,
        total: paymentCount,
        page: Number(payment_page),
        limit: Number(payment_limit)
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payable/uninvoiced/:supplier_code
 * Get uninvoiced inbound records for a supplier (invoice_number is NULL or empty)
 */
router.get('/uninvoiced/:supplier_code', async (req: Request, res: Response): Promise<void> => {
  const supplier_code = req.params['supplier_code'] as string;
  const { page = 1, limit = 10 } = req.query;
  
  const skip = (Number(page) - 1) * Number(limit);
  
  try {
    const where: Prisma.InboundRecordWhereInput = {
      supplier_code,
      OR: [
        { invoice_number: null },
        { invoice_number: '' }
      ]
    };

    const [rows, total] = await prisma.$transaction([
      prisma.inboundRecord.findMany({
        where,
        orderBy: { inbound_date: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.inboundRecord.count({ where })
    ]);
    
    res.json({
      data: rows,
      total,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payable/invoiced/:supplier_code
 * Get invoiced records grouped by invoice_number (from cache)
 */
router.get('/invoiced/:supplier_code', (req: Request, res: Response): void => {
  const supplier_code = req.params['supplier_code'] as string;
  const { page = 1, limit = 10 } = req.query;
  
  const cachedRecords = invoiceCacheService.getCachedInvoicedRecords(supplier_code);
  
  if (!cachedRecords) {
    res.status(404).json({ 
      error: 'No cached data found. Please refresh the cache first.',
      message: 'Cache not initialized'
    });
    return;
  }
  
  const offset = (Number(page) - 1) * Number(limit);
  const paginatedRecords = cachedRecords.slice(offset, offset + Number(limit));
  const lastUpdated = invoiceCacheService.getLastUpdateTime(supplier_code);
  
  res.json({
    data: paginatedRecords,
    total: cachedRecords.length,
    page: Number(page),
    limit: Number(limit),
    last_updated: lastUpdated
  });
});

/**
 * POST /api/payable/invoices/refresh/:supplier_code
 * Refresh invoice cache for a supplier
 */
router.post('/invoices/refresh/:supplier_code', async (req: Request, res: Response): Promise<void> => {
  const supplier_code = req.params['supplier_code'] as string;
  
  try {
    const invoicedRecords = await invoiceCacheService.refreshSupplierCache(supplier_code);
    const lastUpdated = invoiceCacheService.getLastUpdateTime(supplier_code);
    
    res.json({
      message: 'Invoice cache refreshed successfully',
      total: invoicedRecords.length,
      last_updated: lastUpdated,
      data: invoicedRecords
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ 
      error: err.message,
      message: 'Failed to refresh invoice cache'
    });
  }
});

export default router;
