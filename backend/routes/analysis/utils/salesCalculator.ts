import { Prisma } from "@prisma/client";
import { prisma } from "@/prismaClient.js";
import decimalCalc from "@/utils/decimalCalculator.js";
import type { SalesData } from "@/routes/analysis/utils/types.js";

export function calculateSalesData(
  startDate: string,
  endDate: string,
  customerCode: string | null | undefined,
  productModel: string | null | undefined,
  callback: (err: Error | null, salesData?: SalesData) => void
): void {
  (async () => {
    try {
      const baseConditions: Prisma.Sql[] = [
        Prisma.sql`outbound_date >= ${startDate}`,
        Prisma.sql`outbound_date <= ${endDate}`
      ];
      if (customerCode && customerCode !== "All") {
        baseConditions.push(Prisma.sql`customer_code = ${customerCode}`);
      }
      if (productModel && productModel !== "All") {
        baseConditions.push(Prisma.sql`product_model = ${productModel}`);
      }
      const normalSalesWhere = Prisma.sql`WHERE unit_price >= 0 AND ${Prisma.join(baseConditions, " AND ")}`;
      const specialExpenseWhere = Prisma.sql`WHERE unit_price < 0 AND ${Prisma.join(baseConditions, " AND ")}`;
      const query = Prisma.sql`
        SELECT 
          COALESCE(SUM(quantity * unit_price), 0) as normal_sales,
          COALESCE((
            SELECT SUM(ABS(quantity * unit_price)) 
            FROM outbound_records 
            ${specialExpenseWhere}
          ), 0) as special_expense
        FROM outbound_records 
        ${normalSalesWhere}
      `;

      const result = await prisma.$queryRaw<any[]>(query);
      const salesRow = result[0];

      const normalSales = decimalCalc.fromSqlResult(salesRow?.normal_sales, 0, 2);
      const specialExpense = decimalCalc.fromSqlResult(
        salesRow?.special_expense,
        0,
        2
      );
      const salesAmount = decimalCalc.toDbNumber(
        decimalCalc.subtract(normalSales, specialExpense),
        2
      );

      callback(null, {
        normal_sales: normalSales,
        special_expense: specialExpense,
        sales_amount: salesAmount,
      });
    } catch (err) {
      console.error("Failed to calculate sales:", err);
      callback(err as Error);
    }
  })();
}
