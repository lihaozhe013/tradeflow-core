import { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';
import type { SalesData } from '@/routes/analysis/utils/types';

export async function calculateSalesData(
  startDate: string,
  endDate: string,
  customerCode: string | null | undefined,
  productModel: string | null | undefined,
): Promise<SalesData> {
  const baseConditions: Prisma.Sql[] = [
    Prisma.sql`r.outbound_date >= ${startDate}`,
    Prisma.sql`r.outbound_date <= ${endDate}`,
  ];
  if (customerCode && customerCode !== 'All') {
    baseConditions.push(Prisma.sql`r.customer_code = ${customerCode}`);
  }
  if (productModel && productModel !== 'All') {
    baseConditions.push(Prisma.sql`p.product_model = ${productModel}`);
  }

  const query = Prisma.sql`
    SELECT 
      COALESCE(SUM(CASE WHEN r.unit_price >= 0 THEN r.quantity * r.unit_price ELSE 0 END), 0) as normal_sales,
      COALESCE(SUM(CASE WHEN r.unit_price < 0 THEN ABS(r.quantity * r.unit_price) ELSE 0 END), 0) as special_expense
    FROM outbound_records r
    LEFT JOIN products p ON r.product_code = p.code
    WHERE ${Prisma.join(baseConditions, ' AND ')}
  `;

  interface SalesRow {
    normal_sales: number | null;
    special_expense: number | null;
  }

  const result = await prisma.$queryRaw<SalesRow[]>(query);
  const salesRow = result[0];

  const normalSales = decimalCalc.fromSqlResult(salesRow?.normal_sales, 0, 2);
  const specialExpense = decimalCalc.fromSqlResult(salesRow?.special_expense, 0, 2);
  const salesAmount = decimalCalc.toDbNumber(decimalCalc.subtract(normalSales, specialExpense), 2);

  return {
    normal_sales: normalSales,
    special_expense: specialExpense,
    sales_amount: salesAmount,
  };
}
