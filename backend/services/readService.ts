import { Prisma } from '@/prisma/client';
import type { PrismaClient as DbClient } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';

export type ReadDatabase = DbClient | Prisma.TransactionClient;
export type AccountKind = 'receivable' | 'payable';

export interface PageRequest {
  page: number;
  limit: number;
}

export interface PageResult<T> extends PageRequest {
  total: number;
  pages: number;
  data: T[];
}

export async function searchPartners(
  db: ReadDatabase,
  args: {
    type?: number;
    shortName?: string;
    fullName?: string;
    code?: string;
    page?: number;
    limit?: number;
  }
) {
  const where: Prisma.PartnerWhereInput = {};
  if (args.type !== undefined) where.type = args.type;
  if (args.shortName) where.short_name = { contains: args.shortName };
  if (args.fullName) where.full_name = { contains: args.fullName };
  if (args.code) where.code = { contains: args.code };

  const paginated = args.page !== undefined || args.limit !== undefined;
  const page = args.page ?? 1;
  const limit = args.limit ?? 20;
  const data = await db.partner.findMany({
    where,
    orderBy: { short_name: 'asc' },
    ...(paginated ? { skip: (page - 1) * limit, take: limit } : {})
  });
  if (!paginated) return { data };
  const total = await db.partner.count({ where });
  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function searchProducts(
  db: ReadDatabase,
  args: { category?: string; productModel?: string; code?: string; page?: number; limit?: number }
) {
  const where: Prisma.ProductWhereInput = {};
  if (args.category) where.category = { contains: args.category };
  if (args.productModel) where.product_model = { contains: args.productModel };
  if (args.code) where.code = { contains: args.code };

  const paginated = args.page !== undefined || args.limit !== undefined;
  const page = args.page ?? 1;
  const limit = args.limit ?? 20;
  const data = await db.product.findMany({
    where,
    orderBy: { code: 'asc' },
    ...(paginated ? { skip: (page - 1) * limit, take: limit } : {})
  });
  if (!paginated) return { data };
  const total = await db.product.count({ where });
  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function listInventory(
  db: ReadDatabase,
  args: { productModel?: string; page: number; limit: number }
) {
  const where: Prisma.InventoryWhereInput = args.productModel
    ? { product_model: { contains: args.productModel } }
    : {};

  const [rows, total] = await Promise.all([
    db.inventory.findMany({
      where,
      orderBy: { product_model: 'asc' },
      skip: (args.page - 1) * args.limit,
      take: args.limit,
      select: { product_model: true, quantity: true }
    }),
    db.inventory.count({ where })
  ]);

  return {
    data: rows.map((row) => ({
      product_model: row.product_model,
      current_inventory: row.quantity
    })),
    total,
    page: args.page,
    limit: args.limit,
    pages: Math.ceil(total / args.limit)
  };
}

export async function listTransactions(
  db: ReadDatabase,
  args: {
    direction: 'inbound' | 'outbound';
    startDate?: string;
    endDate?: string;
    partnerCode?: string;
    partnerShortName?: string;
    productModel?: string;
    invoiceNumber?: string;
    receiptNumber?: string;
    orderNumber?: string;
    keyword?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    page: number;
    limit: number;
  }
) {
  const inbound = args.direction === 'inbound';
  const dateField = inbound ? 'inbound_date' : 'outbound_date';
  const partnerField = inbound ? 'supplier_code' : 'customer_code';
  const where = {
    ...(args.startDate || args.endDate
      ? {
          [dateField]: {
            ...(args.startDate ? { gte: args.startDate } : {}),
            ...(args.endDate ? { lte: args.endDate } : {})
          }
        }
      : {}),
    ...(args.partnerCode ? { [partnerField]: args.partnerCode } : {}),
    ...(args.partnerShortName
      ? { partner: { short_name: { contains: args.partnerShortName } } }
      : {}),
    ...(args.productModel ? { product: { product_model: { contains: args.productModel } } } : {}),
    ...(args.invoiceNumber
      ? { invoice_number: { contains: args.invoiceNumber, mode: 'insensitive' as const } }
      : {}),
    ...(args.receiptNumber
      ? { receipt_number: { contains: args.receiptNumber, mode: 'insensitive' as const } }
      : {}),
    ...(args.orderNumber
      ? { order_number: { contains: args.orderNumber, mode: 'insensitive' as const } }
      : {}),
    ...(args.keyword
      ? {
          OR: [
            { order_number: { contains: args.keyword, mode: 'insensitive' as const } },
            { invoice_number: { contains: args.keyword, mode: 'insensitive' as const } },
            { receipt_number: { contains: args.keyword, mode: 'insensitive' as const } }
          ]
        }
      : {})
  };
  const skip = (args.page - 1) * args.limit;
  const order = args.sortOrder ?? 'desc';
  const inboundOrder: Prisma.InboundRecordOrderByWithRelationInput =
    args.sortField === 'inbound_date' ||
    args.sortField === 'unit_price' ||
    args.sortField === 'total_price'
      ? { [args.sortField]: order }
      : { id: order };
  const outboundOrder: Prisma.OutboundRecordOrderByWithRelationInput =
    args.sortField === 'outbound_date' ||
    args.sortField === 'unit_price' ||
    args.sortField === 'total_price'
      ? { [args.sortField]: order }
      : { id: order };

  if (inbound) {
    const typedWhere: Prisma.InboundRecordWhereInput = where;
    const [data, total] = await Promise.all([
      db.inboundRecord.findMany({
        where: typedWhere,
        orderBy: inboundOrder,
        skip,
        take: args.limit,
        include: { partner: true, product: true }
      }),
      db.inboundRecord.count({ where: typedWhere })
    ]);
    return {
      data,
      total,
      page: args.page,
      limit: args.limit,
      pages: Math.ceil(total / args.limit)
    };
  }

  const typedWhere: Prisma.OutboundRecordWhereInput = where;
  const [data, total] = await Promise.all([
    db.outboundRecord.findMany({
      where: typedWhere,
      orderBy: outboundOrder,
      skip,
      take: args.limit,
      include: { partner: true, product: true }
    }),
    db.outboundRecord.count({ where: typedWhere })
  ]);
  return { data, total, page: args.page, limit: args.limit, pages: Math.ceil(total / args.limit) };
}

interface AccountBalanceRow {
  partner_code: string;
  short_name: string;
  full_name: string | null;
  total_amount: number | string | null;
  total_paid: number | string | null;
  balance: number | string | null;
  last_payment_date: string | null;
  last_payment_method: string | null;
  payment_count: bigint | number | null;
}

export async function listAccountBalances(
  db: ReadDatabase,
  args: {
    kind: AccountKind;
    shortName?: string;
    page: number;
    limit: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }
) {
  const receivable = args.kind === 'receivable';
  const partnerType = receivable ? 1 : 0;
  const recordTable = receivable ? 'outbound_records' : 'inbound_records';
  const paymentTable = receivable ? 'receivable_payments' : 'payable_payments';
  const partnerColumn = receivable ? 'customer_code' : 'supplier_code';
  const skip = (args.page - 1) * args.limit;
  const name = args.shortName ?? null;
  const column = Prisma.raw(partnerColumn);
  const allowedSortFields = receivable
    ? [
        'customer_code',
        'customer_short_name',
        'total_receivable',
        'total_paid',
        'balance',
        'last_payment_date'
      ]
    : [
        'supplier_code',
        'supplier_short_name',
        'total_payable',
        'total_paid',
        'balance',
        'last_payment_date'
      ];
  const sortFieldMap: Record<string, string> = {
    customer_code: 'partner_code',
    supplier_code: 'partner_code',
    customer_short_name: 'short_name',
    supplier_short_name: 'short_name',
    total_receivable: 'total_amount',
    total_payable: 'total_amount',
    total_paid: 'total_paid',
    balance: 'balance',
    last_payment_date: 'last_payment_date'
  };
  const sortField = Prisma.raw(
    args.sortField && allowedSortFields.includes(args.sortField)
      ? (sortFieldMap[args.sortField] ?? 'balance')
      : 'balance'
  );
  const sortOrder = Prisma.raw(args.sortOrder === 'asc' ? 'ASC' : 'DESC');

  const [rows, total] = await Promise.all([
    db.$queryRaw<AccountBalanceRow[]>(Prisma.sql`
      SELECT
        p.code AS partner_code,
        p.short_name,
        p.full_name,
        COALESCE(r.total_amount, 0) AS total_amount,
        COALESCE(pay.total_paid, 0) AS total_paid,
        COALESCE(r.total_amount, 0) - COALESCE(pay.total_paid, 0) AS balance,
        pay.last_payment_date,
        pay.last_payment_method,
        COALESCE(pay.payment_count, 0) AS payment_count
      FROM partners p
      LEFT JOIN (
        SELECT ${column} AS partner_code, SUM(total_price) AS total_amount
        FROM ${Prisma.raw(recordTable)}
        GROUP BY ${column}
      ) r ON p.code = r.partner_code
      LEFT JOIN (
        SELECT ${column} AS partner_code, SUM(amount) AS total_paid,
          MAX(pay_date) AS last_payment_date, MAX(pay_method) AS last_payment_method,
          COUNT(*) AS payment_count
        FROM ${Prisma.raw(paymentTable)}
        GROUP BY ${column}
      ) pay ON p.code = pay.partner_code
      WHERE p.type = ${partnerType}
        AND (${name}::text IS NULL OR p.short_name ILIKE '%' || ${name} || '%')
      ORDER BY ${sortField} ${sortOrder}, p.code ASC
      LIMIT ${args.limit} OFFSET ${skip}
    `),
    db.partner.count({
      where: {
        type: partnerType,
        ...(args.shortName ? { short_name: { contains: args.shortName } } : {})
      }
    })
  ]);

  return {
    data: rows.map((row) => ({
      ...row,
      total_amount: decimalCalc.fromSqlResult(row.total_amount ?? 0, 0, 2),
      total_paid: decimalCalc.fromSqlResult(row.total_paid ?? 0, 0, 2),
      balance: decimalCalc.calculateBalance(
        decimalCalc.fromSqlResult(row.total_amount ?? 0, 0, 2),
        decimalCalc.fromSqlResult(row.total_paid ?? 0, 0, 2)
      ),
      payment_count: Number(row.payment_count ?? 0)
    })),
    total,
    page: args.page,
    limit: args.limit,
    pages: Math.ceil(total / args.limit)
  };
}

export async function getAccountDetails(
  db: ReadDatabase,
  args: { kind: AccountKind; partnerCode: string; page: number; limit: number }
) {
  const receivable = args.kind === 'receivable';
  const partnerType = receivable ? 1 : 0;
  const [partner, recordSummary, paymentSummary] = await Promise.all([
    db.partner.findFirst({
      where: { code: args.partnerCode, type: partnerType },
      select: { code: true, short_name: true, full_name: true }
    }),
    receivable
      ? db.outboundRecord.aggregate({
          where: { customer_code: args.partnerCode },
          _sum: { total_price: true }
        })
      : db.inboundRecord.aggregate({
          where: { supplier_code: args.partnerCode },
          _sum: { total_price: true }
        }),
    receivable
      ? db.receivablePayment.aggregate({
          where: { customer_code: args.partnerCode },
          _sum: { amount: true }
        })
      : db.payablePayment.aggregate({
          where: { supplier_code: args.partnerCode },
          _sum: { amount: true }
        })
  ]);

  if (!partner) return null;

  const where = receivable
    ? { customer_code: args.partnerCode }
    : { supplier_code: args.partnerCode };
  const recordSkip = (args.page - 1) * args.limit;
  const [records, recordCount, payments, paymentCount] = await Promise.all([
    receivable
      ? db.outboundRecord.findMany({
          where,
          orderBy: [{ outbound_date: 'desc' }, { id: 'desc' }],
          skip: recordSkip,
          take: args.limit,
          select: {
            id: true,
            outbound_date: true,
            product: { select: { product_model: true } },
            quantity: true,
            unit_price: true,
            total_price: true,
            invoice_date: true,
            invoice_number: true,
            receipt_number: true,
            order_number: true
          }
        })
      : db.inboundRecord.findMany({
          where,
          orderBy: [{ inbound_date: 'desc' }, { id: 'desc' }],
          skip: recordSkip,
          take: args.limit,
          select: {
            id: true,
            inbound_date: true,
            product: { select: { product_model: true } },
            quantity: true,
            unit_price: true,
            total_price: true,
            invoice_date: true,
            invoice_number: true,
            receipt_number: true,
            order_number: true
          }
        }),
    receivable ? db.outboundRecord.count({ where }) : db.inboundRecord.count({ where }),
    receivable
      ? db.receivablePayment.findMany({
          where: { customer_code: args.partnerCode },
          orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
          skip: recordSkip,
          take: args.limit,
          select: { id: true, amount: true, pay_date: true, pay_method: true }
        })
      : db.payablePayment.findMany({
          where: { supplier_code: args.partnerCode },
          orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
          skip: recordSkip,
          take: args.limit,
          select: { id: true, amount: true, pay_date: true, pay_method: true }
        }),
    receivable
      ? db.receivablePayment.count({ where: { customer_code: args.partnerCode } })
      : db.payablePayment.count({ where: { supplier_code: args.partnerCode } })
  ]);

  const totalAmount = decimalCalc.fromSqlResult(recordSummary._sum.total_price ?? 0, 0, 2);
  const totalPaid = decimalCalc.fromSqlResult(paymentSummary._sum.amount ?? 0, 0, 2);
  return {
    partner,
    summary: {
      total_amount: totalAmount,
      total_paid: totalPaid,
      balance: decimalCalc.toDbNumber(decimalCalc.subtract(totalAmount, totalPaid), 2)
    },
    transactions: {
      data: records,
      total: recordCount,
      page: args.page,
      limit: args.limit,
      pages: Math.ceil(recordCount / args.limit)
    },
    payments: {
      data: payments,
      total: paymentCount,
      page: args.page,
      limit: args.limit,
      pages: Math.ceil(paymentCount / args.limit)
    }
  };
}
