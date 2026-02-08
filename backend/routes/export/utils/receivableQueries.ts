import { Prisma } from "@prisma/client";
import { prisma } from "@/prismaClient.js";
import decimalCalc from "@/utils/decimalCalculator.js";

export default class ReceivableQueries {
  async getReceivableSummary(filters: any = {}): Promise<any[]> {
    try {
      const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];
      
      if (filters.outboundFrom) {
        conditions.push(Prisma.sql`o.outbound_date >= ${filters.outboundFrom}`);
      }
      if (filters.outboundTo) {
        conditions.push(Prisma.sql`o.outbound_date <= ${filters.outboundTo}`);
      }
      if (filters.paymentFrom) {
        conditions.push(Prisma.sql`(p.pay_date IS NULL OR p.pay_date >= ${filters.paymentFrom})`);
      }
      if (filters.paymentTo) {
        conditions.push(Prisma.sql`(p.pay_date IS NULL OR p.pay_date <= ${filters.paymentTo})`);
      }

      const sql = Prisma.sql`
        SELECT 
          o.customer_code,
          o.customer_short_name,
          o.customer_full_name,
          COALESCE(SUM(o.total_price), 0) as total_sales,
          COALESCE(SUM(p.amount), 0) as total_payments,
          COALESCE(SUM(o.total_price), 0) - COALESCE(SUM(p.amount), 0) as balance
        FROM outbound_records o
        LEFT JOIN receivable_payments p ON o.customer_code = p.customer_code
        WHERE ${Prisma.join(conditions, " AND ")}
        GROUP BY o.customer_code, o.customer_short_name, o.customer_full_name
        ORDER BY balance DESC
      `;
      
      const rows = await prisma.$queryRaw<any[]>(sql);
      
      const processed = rows.map((row) => {
        const totalSales = decimalCalc.fromSqlResult(row.total_sales, 0);
        const totalPayments = decimalCalc.fromSqlResult(
          row.total_payments,
          0
        );
        const balance = decimalCalc.calculateBalance(
          totalSales,
          totalPayments
        );
        return {
          ...row,
          total_sales: totalSales,
          total_payments: totalPayments,
          balance,
        };
      });
      return processed;
    } catch (error) {
      throw error;
    }
  }

  async getReceivableDetails(filters: any = {}): Promise<any[]> {
    try {
      const where: any = {};
      if (filters.outboundFrom) {
        where.outbound_date = { ...where.outbound_date, gte: filters.outboundFrom };
      }
      if (filters.outboundTo) {
        where.outbound_date = { ...where.outbound_date, lte: filters.outboundTo };
      }

      const rows = await prisma.outboundRecord.findMany({
        where,
        select: {
          id: true,
          customer_code: true,
          customer_short_name: true,
          product_model: true,
          total_price: true,
          outbound_date: true,
          remark: true,
        },
        orderBy: [
            { outbound_date: 'desc' },
            { id: 'desc' }
        ]
      });
      return rows.map(r => ({ ...r, record_id: r.id }));
    } catch (error) {
      throw error;
    }
  }

  async getReceivablePayments(filters: any = {}): Promise<any[]> {
    try {
      const where: any = {};
      if (filters.paymentFrom) {
        where.pay_date = { ...where.pay_date, gte: filters.paymentFrom };
      }
      if (filters.paymentTo) {
        where.pay_date = { ...where.pay_date, lte: filters.paymentTo };
      }
      
      const rows = await prisma.receivablePayment.findMany({
        where,
        select: {
          id: true,
          customer_code: true,
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
