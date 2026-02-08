import { Prisma } from "@prisma/client";
import { prisma } from "@/prismaClient.js";
import decimalCalc from "@/utils/decimalCalculator.js";

export default class PayableQueries {
  async getPayableSummary(filters: any = {}): Promise<any[]> {
    try {
      const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];
      
      if (filters.outboundFrom) {
        conditions.push(Prisma.sql`i.inbound_date >= ${filters.outboundFrom}`);
      }
      if (filters.outboundTo) {
        conditions.push(Prisma.sql`i.inbound_date <= ${filters.outboundTo}`);
      }
      if (filters.paymentFrom) {
        conditions.push(Prisma.sql`(p.pay_date IS NULL OR p.pay_date >= ${filters.paymentFrom})`);
      }
      if (filters.paymentTo) {
        conditions.push(Prisma.sql`(p.pay_date IS NULL OR p.pay_date <= ${filters.paymentTo})`);
      }

      const sql = Prisma.sql`
        SELECT 
          i.supplier_code,
          i.supplier_short_name,
          i.supplier_full_name,
          COALESCE(SUM(i.total_price), 0) as total_purchases,
          COALESCE(SUM(p.amount), 0) as total_payments,
          COALESCE(SUM(i.total_price), 0) - COALESCE(SUM(p.amount), 0) as balance
        FROM inbound_records i
        LEFT JOIN payable_payments p ON i.supplier_code = p.supplier_code
        WHERE ${Prisma.join(conditions, " AND ")}
        GROUP BY i.supplier_code, i.supplier_short_name, i.supplier_full_name
        ORDER BY balance DESC
      `;
      
      const rows = await prisma.$queryRaw<any[]>(sql);
      
      const processed = rows.map((row) => {
        const totalPurchases = decimalCalc.fromSqlResult(
          row.total_purchases,
          0
        );
        const totalPayments = decimalCalc.fromSqlResult(
          row.total_payments,
          0
        );
        const balance = decimalCalc.calculateBalance(
          totalPurchases,
          totalPayments
        );
        return {
          ...row,
          total_purchases: totalPurchases,
          total_payments: totalPayments,
          balance,
        };
      });
      return processed;
    } catch (error) {
      throw error;
    }
  }

  async getPayableDetails(filters: any = {}): Promise<any[]> {
    try {
      const where: any = {};
      if (filters.outboundFrom) {
        where.inbound_date = { ...where.inbound_date, gte: filters.outboundFrom };
      }
      if (filters.outboundTo) {
        where.inbound_date = { ...where.inbound_date, lte: filters.outboundTo };
      }

      const rows = await prisma.inboundRecord.findMany({
        where,
        select: {
          id: true,
          supplier_code: true,
          supplier_short_name: true,
          product_model: true,
          total_price: true,
          inbound_date: true,
          remark: true,
        },
        orderBy: [
            { inbound_date: 'desc' },
            { id: 'desc' }
        ]
      });
      
      // Map 'id' to 'record_id' to match original return structure if strictly needed,
      // but usually standardizing on 'id' is better. However, let's preserve compat.
      return rows.map(r => ({ ...r, record_id: r.id }));
    } catch (error) {
      throw error;
    }
  }

  async getPayablePayments(filters: any = {}): Promise<any[]> {
    try {
      const where: any = {};
      if (filters.paymentFrom) {
        where.pay_date = { ...where.pay_date, gte: filters.paymentFrom };
      }
      if (filters.paymentTo) {
        where.pay_date = { ...where.pay_date, lte: filters.paymentTo };
      }

      const rows = await prisma.payablePayment.findMany({
        where,
        select: {
          id: true,
          supplier_code: true,
          amount: true,
          pay_date: true,
          pay_method: true,
          remark: true,
        },
        orderBy: [
            { pay_date: 'desc' },
            { id: 'desc' }
        ]
      });
      
      return rows;
    } catch (error) {
      throw error;
    }
  }
}
