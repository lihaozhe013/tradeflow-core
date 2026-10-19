import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import { getInvoiceSnapshot, refreshInvoiceSnapshot } from '@/services/invoiceSnapshotService';
import { SnapshotError } from '@/services/snapshotRefresh';
import { listAccountBalances } from '@/services/readService';

const router: Router = express.Router();

/**
 * GET /api/payable
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query['page'] ?? 1);
  const limit = Number(req.query['limit'] ?? 10);
  const result = await listAccountBalances(prisma, {
    kind: 'payable',
    shortName:
      typeof req.query['supplier_short_name'] === 'string'
        ? req.query['supplier_short_name']
        : undefined,
    page,
    limit,
    sortField: typeof req.query['sort_field'] === 'string' ? req.query['sort_field'] : undefined,
    sortOrder: req.query['sort_order'] === 'asc' ? 'asc' : 'desc'
  });
  res.json({
    data: result.data.map((row) => ({
      supplier_code: row.partner_code,
      supplier_short_name: row.short_name,
      supplier_full_name: row.full_name,
      total_payable: row.total_amount,
      total_paid: row.total_paid,
      balance: row.balance,
      last_payment_date: row.last_payment_date,
      last_payment_method: row.last_payment_method,
      payment_count: row.payment_count
    })),
    total: result.total,
    page: result.page,
    limit: result.limit,
    summary: {
      total_amount: result.summary.total_amount,
      total_paid: result.summary.total_paid,
      total_outstanding: result.summary.total_outstanding,
      partner_count: result.summary.partner_count,
      settled_count: result.summary.settled_count
    }
  });
});

/**
 * GET /api/payable/payments/:supplier_code
 */
router.get('/payments/:supplier_code', async (req: Request, res: Response): Promise<void> => {
  const supplier_code = req.params['supplier_code'] as string;
  const { page = 1, limit = 10 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const [rows, total] = await prisma.$transaction([
    prisma.payablePayment.findMany({
      where: { supplier_code },
      orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
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
});

/**
 * POST /api/payable/payments
 */
router.post('/payments', async (req: Request, res: Response): Promise<void> => {
  const { supplier_code, amount, pay_date, pay_method, remark } = req.body;

  if (!supplier_code || amount === undefined || !pay_date) {
    res.status(400).json({
      error: 'Supplier ID, payment amount, and payment date are required fields'
    });
    return;
  }

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
});

/**
 * PUT /api/payable/payments/:id
 */
router.put('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  const { supplier_code, amount, pay_date, pay_method, remark } = req.body;

  if (!supplier_code || amount === undefined || !pay_date) {
    res.status(400).json({
      error: 'Supplier ID, payment amount, and payment date are required fields'
    });
    return;
  }

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
});

/**
 * DELETE /api/payable/payments/:id
 */
router.delete('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  await prisma.payablePayment.delete({ where: { id } });
  res.json({ message: 'Payment record deleted!' });
});

/**
 * GET /api/payable/details/:supplier_code
 */
router.get('/details/:supplier_code', async (req: Request, res: Response): Promise<void> => {
  const supplier_code = req.params['supplier_code'] as string;
  const { inbound_page = 1, inbound_limit = 10, payment_page = 1, payment_limit = 10 } = req.query;

  const supplier = await prisma.partner.findFirst({
    where: { code: supplier_code, type: 0 }
  });

  if (!supplier) {
    res.status(404).json({ error: 'Supplier dne' });
    return;
  }

  const inboundSkip = (Number(inbound_page) - 1) * Number(inbound_limit);
  const paymentSkip = (Number(payment_page) - 1) * Number(payment_limit);

  const [inboundRecords, inboundCount, paymentRecords, paymentCount, inboundAgg, paymentAgg] =
    await Promise.all([
      prisma.inboundRecord.findMany({
        where: { supplier_code },
        orderBy: { inbound_date: 'desc' },
        skip: inboundSkip,
        take: Number(inbound_limit)
      }),
      prisma.inboundRecord.count({ where: { supplier_code } }),
      prisma.payablePayment.findMany({
        where: { supplier_code },
        orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
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
});

/**
 * GET /api/payable/uninvoiced/:supplier_code
 * Get uninvoiced inbound records for a supplier (invoice_number is NULL or empty)
 */
router.get('/uninvoiced/:supplier_code', async (req: Request, res: Response): Promise<void> => {
  const supplier_code = req.params['supplier_code'] as string;
  const { page = 1, limit = 10 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const where: Prisma.InboundRecordWhereInput = {
    supplier_code,
    OR: [{ invoice_number: null }, { invoice_number: '' }]
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
});

router.get('/invoiced/:supplier_code', async (req: Request, res: Response): Promise<void> => {
  const partnerCode = req.params['supplier_code'] as string;
  const page = req.query['page'] ?? '1';
  const limit = req.query['limit'] ?? '10';
  if (
    typeof page !== 'string' ||
    typeof limit !== 'string' ||
    !/^[1-9]\d*$/.test(page) ||
    !/^[1-9]\d*$/.test(limit) ||
    !Number.isSafeInteger(Number(page)) ||
    !Number.isSafeInteger(Number(limit)) ||
    !Number.isSafeInteger(Number(page) * Number(limit))
  ) {
    throw new SnapshotError(400, 'INVALID_PAGINATION', 'Page and limit must be positive integers.');
  }
  const snapshot = await getInvoiceSnapshot('payable', partnerCode);
  if (!snapshot) {
    throw new SnapshotError(404, 'SNAPSHOT_NOT_READY', 'Data not generated, please refresh first.');
  }
  const offset = (Number(page) - 1) * Number(limit);
  res.json({
    data: snapshot.data.slice(offset, offset + Number(limit)),
    total: snapshot.data.length,
    page: Number(page),
    limit: Number(limit),
    last_updated: snapshot.last_updated
  });
});

router.post(
  '/invoices/refresh/:supplier_code',
  async (req: Request, res: Response): Promise<void> => {
    const snapshot = await refreshInvoiceSnapshot('payable', req.params['supplier_code'] as string);
    res.json({
      message: 'Invoice data refreshed successfully',
      total: snapshot.data.length,
      ...snapshot
    });
  }
);

export default router;
