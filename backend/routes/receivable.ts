import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient.js';
import { Prisma } from '@prisma/client';
import decimalCalc from '@/utils/decimalCalculator.js';
import invoiceCacheService from '@/utils/invoiceCacheService.js';

const router: Router = express.Router();

interface ReceivableRow {
  customer_code: string;
  customer_short_name: string;
  customer_full_name: string;
  total_receivable: number;
  total_paid: number;
  balance: number;
  last_payment_date: string | null;
  last_payment_method: string | null;
  payment_count: number;
}

/**
 * GET /api/receivable
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { page = 1, limit = 10, customer_short_name, sort_field = 'balance', sort_order = 'desc' } = req.query;
  
  let whereClause = "WHERE p.type = 1";
  
  if (customer_short_name) {
    // Basic sanitization for LIKE clause
    const sanitizedVal = String(customer_short_name).replace(/'/g, "''");
    whereClause += ` AND p.short_name LIKE '%${sanitizedVal}%'`;
  }

  const allowedSortFields = ['customer_code', 'customer_short_name', 'total_receivable', 'total_paid', 'balance', 'last_payment_date'];
  let orderBy = 'balance DESC';
  if (sort_field && allowedSortFields.includes(sort_field as string)) {
    const sortOrderStr = sort_order && (sort_order as string).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    orderBy = `${sort_field} ${sortOrderStr}`;
  }

  const offset = (Number(page) - 1) * Number(limit);

  // Using raw SQL for the main dashboard view to maintain the exact aggregation logic and efficiency
  // Prisma doesn't support this kind of complex left-joined aggregation + sorting on aggregates easily without fetching all data.
  const sql = `
    SELECT
      p.code AS customer_code,
      p.short_name AS customer_short_name,
      p.full_name AS customer_full_name,
      COALESCE(o.total_receivable, 0) AS total_receivable,
      COALESCE(r.total_paid, 0) AS total_paid,
      COALESCE(o.total_receivable, 0) - COALESCE(r.total_paid, 0) AS balance,
      r.last_payment_date,
      r.last_payment_method,
      r.payment_count
    FROM partners p
    LEFT JOIN (
      SELECT customer_code, SUM(total_price) AS total_receivable
      FROM outbound_records
      GROUP BY customer_code
    ) o ON p.code = o.customer_code
    LEFT JOIN (
      SELECT customer_code, SUM(amount) AS total_paid, MAX(pay_date) AS last_payment_date, MAX(pay_method) AS last_payment_method, COUNT(*) AS payment_count
      from receivable_payments
      GROUP BY customer_code
    ) r ON p.code = r.customer_code
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${Number(limit)} OFFSET ${offset}
  `;

  try {
    const rows = await prisma.$queryRawUnsafe<ReceivableRow[]>(sql);

    // Process rows to ensure decimal precision
    const processedRows = rows.map(row => {
      const totalReceivable = decimalCalc.fromSqlResult(row.total_receivable, 0);
      const totalPaid = decimalCalc.fromSqlResult(row.total_paid, 0);
      const balance = decimalCalc.calculateBalance(totalReceivable, totalPaid);
      
      // Convert BigInt to Number for payment_count
      const paymentCount = row.payment_count ? Number(row.payment_count) : 0;
      
      return {
        ...row,
        total_receivable: totalReceivable,
        total_paid: totalPaid,
        balance: balance,
        payment_count: paymentCount
      };
    });

    // Count total partners matching criteria
    const where: Prisma.PartnerWhereInput = { type: 1 };
    if (customer_short_name) {
      where.short_name = { contains: customer_short_name as string };
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
 * GET /api/receivable/payments/:customer_code
 */
router.get('/payments/:customer_code', async (req: Request, res: Response): Promise<void> => {
  const customer_code = req.params['customer_code'] as string;
  const { page = 1, limit = 10 } = req.query;
  
  const skip = (Number(page) - 1) * Number(limit);
  
  try {
    const [rows, total] = await prisma.$transaction([
      prisma.receivablePayment.findMany({
        where: { customer_code },
        orderBy: { pay_date: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.receivablePayment.count({ where: { customer_code } })
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
 * POST /api/receivable/payments
 */
router.post('/payments', async (req: Request, res: Response): Promise<void> => {
  const { customer_code, amount, pay_date, pay_method, remark } = req.body;
  
  if (!customer_code || amount === undefined || !pay_date) {
    res.status(400).json({ error: 'Customer ID, payment amount, and payment date are required fields' });
    return;
  }
  
  try {
    const result = await prisma.receivablePayment.create({
      data: {
        customer_code,
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
 * PUT /api/receivable/payments/:id
 */
router.put('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  const { customer_code, amount, pay_date, pay_method, remark } = req.body;
  
  if (!customer_code || amount === undefined || !pay_date) {
    res.status(400).json({ error: 'Customer ID, payment amount, and payment date are required fields' });
    return;
  }
  
  try {
    await prisma.receivablePayment.update({
      where: { id },
      data: {
        customer_code,
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
        res.status(404).json({ error: 'Payment records dne' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/receivable/payments/:id
 */
router.delete('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params['id']);
    
    await prisma.receivablePayment.delete({ where: { id } });
    
    res.json({ message: 'Payment record deleted!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'Payment records dne' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/receivable/details/:customer_code
 */
router.get('/details/:customer_code', async (req: Request, res: Response): Promise<void> => {
  const customer_code = req.params['customer_code'] as string;
  const { 
    outbound_page = 1, 
    outbound_limit = 10, 
    payment_page = 1, 
    payment_limit = 10 
  } = req.query;

  try {
    const customer = await prisma.partner.findFirst({
      where: { code: customer_code, type: 1 }
    });

    if (!customer) {
      res.status(404).json({ error: 'Clienet dne' });
      return;
    }

    const outboundSkip = (Number(outbound_page) - 1) * Number(outbound_limit);
    const paymentSkip = (Number(payment_page) - 1) * Number(payment_limit);

    // Parallel fetch
    const [
      outboundRecords,
      outboundCount,
      paymentRecords,
      paymentCount,
      outboundAgg,
      paymentAgg
    ] = await Promise.all([
      prisma.outboundRecord.findMany({
        where: { customer_code },
        orderBy: { outbound_date: 'desc' },
        skip: outboundSkip,
        take: Number(outbound_limit)
      }),
      prisma.outboundRecord.count({ where: { customer_code } }),
      prisma.receivablePayment.findMany({
        where: { customer_code },
        orderBy: { pay_date: 'desc' },
        skip: paymentSkip,
        take: Number(payment_limit)
      }),
      prisma.receivablePayment.count({ where: { customer_code } }),
      prisma.outboundRecord.aggregate({
        where: { customer_code },
        _sum: { total_price: true }
      }),
      prisma.receivablePayment.aggregate({
        where: { customer_code },
        _sum: { amount: true }
      })
    ]);

    const totalReceivable = decimalCalc.fromSqlResult(outboundAgg._sum?.total_price || 0, 0);
    const totalPaid = decimalCalc.fromSqlResult(paymentAgg._sum?.amount || 0, 0);
    const balance = decimalCalc.calculateBalance(totalReceivable, totalPaid);
    
    res.json({
      customer,
      summary: {
        total_receivable: totalReceivable,
        total_paid: totalPaid,
        balance: balance
      },
      outbound_records: {
        data: outboundRecords,
        total: outboundCount,
        page: Number(outbound_page),
        limit: Number(outbound_limit)
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
 * GET /api/receivable/uninvoiced/:customer_code
 * Get uninvoiced outbound records for a customer (invoice_number is NULL or empty)
 */
router.get('/uninvoiced/:customer_code', async (req: Request, res: Response): Promise<void> => {
  const customer_code = req.params['customer_code'] as string;
  const { page = 1, limit = 10 } = req.query;
  
  const skip = (Number(page) - 1) * Number(limit);
  
  try {
    const where: Prisma.OutboundRecordWhereInput = {
      customer_code,
      OR: [
        { invoice_number: null },
        { invoice_number: '' }
      ]
    };

    const [rows, total] = await prisma.$transaction([
      prisma.outboundRecord.findMany({
        where,
        orderBy: { outbound_date: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.outboundRecord.count({ where })
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
 * GET /api/receivable/invoiced/:customer_code
 * Get invoiced records grouped by invoice_number (from cache)
 */
router.get('/invoiced/:customer_code', (req: Request, res: Response): void => {
  const customer_code  = req.params['customer_code'] as string;
  const { page = 1, limit = 10 } = req.query;
  
  const cachedRecords = invoiceCacheService.getCachedInvoicedRecords(customer_code);
  
  if (!cachedRecords) {
    res.status(404).json({ 
      error: 'No cached data found. Please refresh the cache first.',
      message: 'Cache not initialized'
    });
    return;
  }
  
  const offset = (Number(page) - 1) * Number(limit);
  const paginatedRecords = cachedRecords.slice(offset, offset + Number(limit));
  const lastUpdated = invoiceCacheService.getLastUpdateTime(customer_code);
  
  res.json({
    data: paginatedRecords,
    total: cachedRecords.length,
    page: Number(page),
    limit: Number(limit),
    last_updated: lastUpdated
  });
});

/**
 * POST /api/receivable/invoices/refresh/:customer_code
 */
router.post('/invoices/refresh/:customer_code', async (req: Request, res: Response): Promise<void> => {
  const customer_code  = req.params['customer_code'] as string;
  
  try {
    const invoicedRecords = await invoiceCacheService.refreshCustomerCache(customer_code);
    const lastUpdated = invoiceCacheService.getLastUpdateTime(customer_code);
    
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
