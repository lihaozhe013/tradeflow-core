import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import invoiceCacheService from '@/utils/invoiceCacheService';
import { listAccountBalances } from '@/services/readService';

const router: Router = express.Router();

/**
 * GET /api/receivable
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query['page'] ?? 1);
  const limit = Number(req.query['limit'] ?? 10);
  const result = await listAccountBalances(prisma, {
    kind: 'receivable',
    shortName:
      typeof req.query['customer_short_name'] === 'string'
        ? req.query['customer_short_name']
        : undefined,
    page,
    limit,
    sortField: typeof req.query['sort_field'] === 'string' ? req.query['sort_field'] : undefined,
    sortOrder: req.query['sort_order'] === 'asc' ? 'asc' : 'desc'
  });
  res.json({
    data: result.data.map((row) => ({
      customer_code: row.partner_code,
      customer_short_name: row.short_name,
      customer_full_name: row.full_name,
      total_receivable: row.total_amount,
      total_paid: row.total_paid,
      balance: row.balance,
      last_payment_date: row.last_payment_date,
      last_payment_method: row.last_payment_method,
      payment_count: row.payment_count
    })),
    total: result.total,
    page: result.page,
    limit: result.limit
  });
});

/**
 * GET /api/receivable/payments/:customer_code
 */
router.get('/payments/:customer_code', async (req: Request, res: Response): Promise<void> => {
  const customer_code = req.params['customer_code'] as string;
  const { page = 1, limit = 10 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const [rows, total] = await prisma.$transaction([
    prisma.receivablePayment.findMany({
      where: { customer_code },
      orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
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
});

/**
 * POST /api/receivable/payments
 */
router.post('/payments', async (req: Request, res: Response): Promise<void> => {
  const { customer_code, amount, pay_date, pay_method, remark } = req.body;

  if (!customer_code || amount === undefined || !pay_date) {
    res.status(400).json({
      error: 'Customer ID, payment amount, and payment date are required fields'
    });
    return;
  }

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
});

/**
 * PUT /api/receivable/payments/:id
 */
router.put('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  const { customer_code, amount, pay_date, pay_method, remark } = req.body;

  if (!customer_code || amount === undefined || !pay_date) {
    res.status(400).json({
      error: 'Customer ID, payment amount, and payment date are required fields'
    });
    return;
  }

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
});

/**
 * DELETE /api/receivable/payments/:id
 */
router.delete('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  await prisma.receivablePayment.delete({ where: { id } });
  res.json({ message: 'Payment record deleted!' });
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
  const [outboundRecords, outboundCount, paymentRecords, paymentCount, outboundAgg, paymentAgg] =
    await Promise.all([
      prisma.outboundRecord.findMany({
        where: { customer_code },
        orderBy: { outbound_date: 'desc' },
        skip: outboundSkip,
        take: Number(outbound_limit)
      }),
      prisma.outboundRecord.count({ where: { customer_code } }),
      prisma.receivablePayment.findMany({
        where: { customer_code },
        orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
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
});

/**
 * GET /api/receivable/uninvoiced/:customer_code
 * Get uninvoiced outbound records for a customer (invoice_number is NULL or empty)
 */
router.get('/uninvoiced/:customer_code', async (req: Request, res: Response): Promise<void> => {
  const customer_code = req.params['customer_code'] as string;
  const { page = 1, limit = 10 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const where: Prisma.OutboundRecordWhereInput = {
    customer_code,
    OR: [{ invoice_number: null }, { invoice_number: '' }]
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
});

/**
 * GET /api/receivable/invoiced/:customer_code
 * Get invoiced records grouped by invoice_number (from cache)
 */
router.get('/invoiced/:customer_code', (req: Request, res: Response): void => {
  const customer_code = req.params['customer_code'] as string;
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
router.post(
  '/invoices/refresh/:customer_code',
  async (req: Request, res: Response): Promise<void> => {
    const customer_code = req.params['customer_code'] as string;
    const invoicedRecords = await invoiceCacheService.refreshCustomerCache(customer_code);
    const lastUpdated = invoiceCacheService.getLastUpdateTime(customer_code);

    res.json({
      message: 'Invoice cache refreshed successfully',
      total: invoicedRecords.length,
      last_updated: lastUpdated,
      data: invoicedRecords
    });
  }
);

export default router;
