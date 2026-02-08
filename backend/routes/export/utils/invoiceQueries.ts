import { Prisma } from "@prisma/client";
import { prisma } from "@/prismaClient.js";

export default class InvoiceQueries {
  async getInvoiceData(filters: any = {}): Promise<any[]> {
    const { partnerCode, dateFrom, dateTo } = filters || {};
    if (!partnerCode) throw new Error("Partner Code is required");
    try {
      const inboundConditions: Prisma.Sql[] = [
        Prisma.sql`(supplier_code = ${partnerCode} OR supplier_short_name = ${partnerCode})`
      ];
      if (dateFrom) inboundConditions.push(Prisma.sql`inbound_date >= ${dateFrom}`);
      if (dateTo) inboundConditions.push(Prisma.sql`inbound_date <= ${dateTo}`);

      const outboundConditions: Prisma.Sql[] = [
        Prisma.sql`(customer_code = ${partnerCode} OR customer_short_name = ${partnerCode})`
      ];
      if (dateFrom) outboundConditions.push(Prisma.sql`outbound_date >= ${dateFrom}`);
      if (dateTo) outboundConditions.push(Prisma.sql`outbound_date <= ${dateTo}`);

      const sql = Prisma.sql`
        SELECT 
          product_model,
          unit_price,
          SUM(quantity) as quantity,
          SUM(total_price) as total_price
        FROM (
          SELECT 
            product_model,
            unit_price,
            quantity,
            total_price
          FROM inbound_records 
          WHERE ${Prisma.join(inboundConditions, " AND ")}
          UNION ALL
          SELECT 
            product_model,
            unit_price,
            quantity,
            total_price
          FROM outbound_records 
          WHERE ${Prisma.join(outboundConditions, " AND ")}
        ) as combined_records
        GROUP BY product_model, unit_price
        ORDER BY product_model, unit_price
      `;
      
      const rows = await prisma.$queryRaw<any[]>(sql);
      
      // Serialize numbers
      return rows.map(row => ({
        ...row,
        quantity: typeof row.quantity === 'bigint' ? Number(row.quantity) : row.quantity,
        total_price: typeof row.total_price === 'bigint' ? Number(row.total_price) : row.total_price
      }));
    } catch (error) {
      throw error as Error;
    }
  }
}

