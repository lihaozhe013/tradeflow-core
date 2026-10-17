import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import { parseSnapshot, refreshSnapshot, SnapshotError } from './snapshotRefresh';
import { invoicedRecordsSchema } from './snapshotTypes';
import type { InvoiceDirection, InvoicedRecord } from './snapshotTypes';

async function calculateCustomerInvoices(tx: Prisma.TransactionClient, partnerCode: string) {
  const groups = await tx.outboundRecord.groupBy({
    by: ['invoice_number'],
    where: {
      customer_code: partnerCode,
      invoice_number: { not: null, notIn: [''] }
    },
    _sum: {
      total_price: true
    },
    _min: {
      invoice_date: true
    },
    _max: {
      outbound_date: true
    },
    _count: {
      _all: true
    }
  });

  groups.sort((a, b) => {
    const dateA = a._min.invoice_date ?? a._max.outbound_date ?? '';
    const dateB = b._min.invoice_date ?? b._max.outbound_date ?? '';
    return dateB.localeCompare(dateA);
  });

  const invoicedRecords: InvoicedRecord[] = groups.map((g) => ({
    invoice_number: g.invoice_number!,
    invoice_date: g._min.invoice_date ?? g._max.outbound_date ?? null,
    total_amount: decimalCalc.fromSqlResult(g._sum.total_price || 0, 0),
    record_count: g._count._all
  }));

  return invoicedRecords;
}

async function calculateSupplierInvoices(tx: Prisma.TransactionClient, partnerCode: string) {
  const groups = await tx.inboundRecord.groupBy({
    by: ['invoice_number'],
    where: {
      supplier_code: partnerCode,
      invoice_number: { not: null, notIn: [''] }
    },
    _sum: {
      total_price: true
    },
    _min: {
      invoice_date: true
    },
    _max: {
      inbound_date: true
    },
    _count: {
      _all: true
    }
  });

  groups.sort((a, b) => {
    const dateA = a._min.invoice_date ?? a._max.inbound_date ?? '';
    const dateB = b._min.invoice_date ?? b._max.inbound_date ?? '';
    return dateB.localeCompare(dateA);
  });

  const invoicedRecords: InvoicedRecord[] = groups.map((g) => ({
    invoice_number: g.invoice_number!,
    invoice_date: g._min.invoice_date ?? g._max.inbound_date ?? null,
    total_amount: decimalCalc.fromSqlResult(g._sum.total_price || 0, 0),
    record_count: g._count._all
  }));

  return invoicedRecords;
}

export async function getInvoiceSnapshot(direction: InvoiceDirection, partnerCode: string) {
  const snapshot = await prisma.invoiceSnapshot.findUnique({
    where: { direction_partner_code: { direction, partner_code: partnerCode } }
  });
  if (!snapshot) return null;
  return {
    data: parseSnapshot(invoicedRecordsSchema, snapshot.data),
    last_updated: snapshot.last_updated.toISOString()
  };
}

export async function refreshInvoiceSnapshot(direction: InvoiceDirection, partnerCode: string) {
  return refreshSnapshot(`invoice:${direction}:${partnerCode}`, async (tx) => {
    const partner = await tx.partner.findUnique({
      where: { code: partnerCode },
      select: { type: true }
    });
    if (!partner || partner.type !== (direction === 'receivable' ? 1 : 0)) {
      throw new SnapshotError(
        404,
        'PARTNER_NOT_FOUND',
        'Customer or supplier not found for this direction.'
      );
    }
    const data: InvoicedRecord[] = parseSnapshot(
      invoicedRecordsSchema,
      direction === 'receivable'
        ? await calculateCustomerInvoices(tx, partnerCode)
        : await calculateSupplierInvoices(tx, partnerCode)
    );
    const snapshot = await tx.invoiceSnapshot.upsert({
      where: { direction_partner_code: { direction, partner_code: partnerCode } },
      create: { direction, partner_code: partnerCode, data, last_updated: new Date() },
      update: { data, last_updated: new Date() }
    });
    return { data, last_updated: snapshot.last_updated.toISOString() };
  });
}
