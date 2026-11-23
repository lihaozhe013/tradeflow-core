import { Hono } from 'hono';
import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import { getInvoiceSnapshot, refreshInvoiceSnapshot } from '@/services/invoiceSnapshotService';
import { SnapshotError } from '@/services/snapshotRefresh';
import { listAccountBalances } from '@/services/readService';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

/**
 * GET /api/payable
 */
app.get('/', async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 10);
  const supplier_short_name = c.req.query('supplier_short_name');
  const sort_field = c.req.query('sort_field');
  const sort_order = c.req.query('sort_order');

  const result = await listAccountBalances(prisma, {
    kind: 'payable',
    shortName: supplier_short_name,
    page,
    limit,
    sortField: sort_field,
    sortOrder: sort_order === 'asc' ? 'asc' : 'desc'
  });
  return c.json({
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
app.get('/payments/:supplier_code', async (c) => {
  const supplier_code = c.req.param('supplier_code');
  const page = Number(c.req.query('page') || 1);
  const limit = Number(c.req.query('limit') || 10);

  const skip = (page - 1) * limit;

  const [rows, total] = await prisma.$transaction([
    prisma.payablePayment.findMany({
      where: { supplier_code },
      orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
      skip,
      take: limit
    }),
    prisma.payablePayment.count({ where: { supplier_code } })
  ]);

  return c.json({
    data: rows,
    total,
    page,
    limit
  });
});

/**
 * POST /api/payable/payments
 */
app.post('/payments', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { supplier_code, amount, pay_date, pay_method, remark } = body;

  if (!supplier_code || amount === undefined || !pay_date) {
    return c.json(
      { error: 'Supplier ID, payment amount, and payment date are required fields' },
      400
    );
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
  return c.json({ id: result.id, message: 'Payment record created!' });
});

/**
 * PUT /api/payable/payments/:id
 */
app.put('/payments/:id', async (c) => {
  const id = Number(c.req.param('id'));
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { supplier_code, amount, pay_date, pay_method, remark } = body;

  if (!supplier_code || amount === undefined || !pay_date) {
    return c.json(
      { error: 'Supplier ID, payment amount, and payment date are required fields' },
      400
    );
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
  return c.json({ message: 'Payment record updated!' });
});

/**
 * DELETE /api/payable/payments/:id
 */
app.delete('/payments/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await prisma.payablePayment.delete({ where: { id } });
  return c.json({ message: 'Payment record deleted!' });
});

/**
 * GET /api/payable/details/:supplier_code
 */
app.get('/details/:supplier_code', async (c) => {
  const supplier_code = c.req.param('supplier_code');
  const inbound_page = c.req.query('inbound_page') ?? '1';
  const inbound_limit = c.req.query('inbound_limit') ?? '10';
  const payment_page = c.req.query('payment_page') ?? '1';
  const payment_limit = c.req.query('payment_limit') ?? '10';

  const supplier = await prisma.partner.findFirst({
    where: { code: supplier_code, type: 0 }
  });

  if (!supplier) {
    return c.json({ error: 'Supplier dne' }, 404);
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

  return c.json({
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
 */
app.get('/uninvoiced/:supplier_code', async (c) => {
  const supplier_code = c.req.param('supplier_code');
  const page = Number(c.req.query('page') || 1);
  const limit = Number(c.req.query('limit') || 10);

  const skip = (page - 1) * limit;

  const where: Prisma.InboundRecordWhereInput = {
    supplier_code,
    OR: [{ invoice_number: null }, { invoice_number: '' }]
  };

  const [rows, total] = await prisma.$transaction([
    prisma.inboundRecord.findMany({
      where,
      orderBy: { inbound_date: 'desc' },
      skip,
      take: limit
    }),
    prisma.inboundRecord.count({ where })
  ]);

  return c.json({
    data: rows,
    total,
    page,
    limit
  });
});

app.get('/invoiced/:supplier_code', async (c) => {
  const partnerCode = c.req.param('supplier_code');
  const pageQueries = c.req.queries('page');
  const limitQueries = c.req.queries('limit');
  if ((pageQueries && pageQueries.length > 1) || (limitQueries && limitQueries.length > 1)) {
    throw new SnapshotError(400, 'INVALID_PAGINATION', 'Page and limit must be positive integers.');
  }
  const page = pageQueries?.[0] ?? '1';
  const limit = limitQueries?.[0] ?? '10';
  if (
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
  return c.json({
    data: snapshot.data.slice(offset, offset + Number(limit)),
    total: snapshot.data.length,
    page: Number(page),
    limit: Number(limit),
    last_updated: snapshot.last_updated
  });
});

app.post('/invoices/refresh/:supplier_code', async (c) => {
  const supplier_code = c.req.param('supplier_code');
  const snapshot = await refreshInvoiceSnapshot('payable', supplier_code);
  return c.json({
    message: 'Invoice data refreshed successfully',
    total: snapshot.data.length,
    ...snapshot
  });
});

export default app;
