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
 * GET /api/receivable
 */
app.get('/', async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 10);
  const customer_short_name = c.req.query('customer_short_name');
  const sort_field = c.req.query('sort_field');
  const sort_order = c.req.query('sort_order');

  const result = await listAccountBalances(prisma, {
    kind: 'receivable',
    shortName: customer_short_name,
    page,
    limit,
    sortField: sort_field,
    sortOrder: sort_order === 'asc' ? 'asc' : 'desc'
  });
  return c.json({
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
 * GET /api/receivable/payments/:customer_code
 */
app.get('/payments/:customer_code', async (c) => {
  const customer_code = c.req.param('customer_code');
  const page = Number(c.req.query('page') || 1);
  const limit = Number(c.req.query('limit') || 10);

  const skip = (page - 1) * limit;

  const [rows, total] = await prisma.$transaction([
    prisma.receivablePayment.findMany({
      where: { customer_code },
      orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
      skip,
      take: limit
    }),
    prisma.receivablePayment.count({ where: { customer_code } })
  ]);

  return c.json({
    data: rows,
    total,
    page,
    limit
  });
});

/**
 * POST /api/receivable/payments
 */
app.post('/payments', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { customer_code, amount, pay_date, pay_method, remark } = body;

  if (!customer_code || amount === undefined || !pay_date) {
    return c.json(
      { error: 'Customer ID, payment amount, and payment date are required fields' },
      400
    );
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
  return c.json({ id: result.id, message: 'Payment record created!' });
});

/**
 * PUT /api/receivable/payments/:id
 */
app.put('/payments/:id', async (c) => {
  const id = Number(c.req.param('id'));
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { customer_code, amount, pay_date, pay_method, remark } = body;

  if (!customer_code || amount === undefined || !pay_date) {
    return c.json(
      { error: 'Customer ID, payment amount, and payment date are required fields' },
      400
    );
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
  return c.json({ message: 'Payment record updated!' });
});

/**
 * DELETE /api/receivable/payments/:id
 */
app.delete('/payments/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await prisma.receivablePayment.delete({ where: { id } });
  return c.json({ message: 'Payment record deleted!' });
});

/**
 * GET /api/receivable/details/:customer_code
 */
app.get('/details/:customer_code', async (c) => {
  const customer_code = c.req.param('customer_code');
  const outbound_page = c.req.query('outbound_page') ?? '1';
  const outbound_limit = c.req.query('outbound_limit') ?? '10';
  const payment_page = c.req.query('payment_page') ?? '1';
  const payment_limit = c.req.query('payment_limit') ?? '10';

  const customer = await prisma.partner.findFirst({
    where: { code: customer_code, type: 1 }
  });

  if (!customer) {
    return c.json({ error: 'Clienet dne' }, 404);
  }

  const outboundSkip = (Number(outbound_page) - 1) * Number(outbound_limit);
  const paymentSkip = (Number(payment_page) - 1) * Number(payment_limit);

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

  return c.json({
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
 */
app.get('/uninvoiced/:customer_code', async (c) => {
  const customer_code = c.req.param('customer_code');
  const page = Number(c.req.query('page') || 1);
  const limit = Number(c.req.query('limit') || 10);

  const skip = (page - 1) * limit;

  const where: Prisma.OutboundRecordWhereInput = {
    customer_code,
    OR: [{ invoice_number: null }, { invoice_number: '' }]
  };

  const [rows, total] = await prisma.$transaction([
    prisma.outboundRecord.findMany({
      where,
      orderBy: { outbound_date: 'desc' },
      skip,
      take: limit
    }),
    prisma.outboundRecord.count({ where })
  ]);

  return c.json({
    data: rows,
    total,
    page,
    limit
  });
});

app.get('/invoiced/:customer_code', async (c) => {
  const partnerCode = c.req.param('customer_code');
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
  const snapshot = await getInvoiceSnapshot('receivable', partnerCode);
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

app.post('/invoices/refresh/:customer_code', async (c) => {
  const customer_code = c.req.param('customer_code');
  const snapshot = await refreshInvoiceSnapshot('receivable', customer_code);
  return c.json({
    message: 'Invoice data refreshed successfully',
    total: snapshot.data.length,
    ...snapshot
  });
});

export default app;
