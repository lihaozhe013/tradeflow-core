import { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';
import type { PurchaseData } from '@/routes/analysis/utils/types';

interface PurchaseResult {
  purchase_amount: number | null;
}

export async function calculatePurchaseData(
  startDate: string,
  endDate: string,
  supplierCode: string | null | undefined,
  productModel: string | null | undefined,
): Promise<PurchaseData> {
  // Build Purchase Query Conditions
  const purchaseSqlConditions: Prisma.Sql[] = [
    Prisma.sql`r.inbound_date >= ${startDate}`,
    Prisma.sql`r.inbound_date <= ${endDate}`,
  ];

  if (supplierCode && supplierCode !== 'All') {
    purchaseSqlConditions.push(Prisma.sql`r.supplier_code = ${supplierCode}`);
  }

  if (productModel && productModel !== 'All') {
    purchaseSqlConditions.push(Prisma.sql`p.product_model = ${productModel}`);
  }

  const query = Prisma.sql`
    SELECT 
      COALESCE(SUM(r.quantity * r.unit_price), 0) as purchase_amount
    FROM inbound_records r
    LEFT JOIN products p ON r.product_code = p.code
    WHERE ${Prisma.join(purchaseSqlConditions, ' AND ')}
  `;

  const result = await prisma.$queryRaw<PurchaseResult[]>(query);
  const purchaseRow = result[0];
  const purchaseAmount = decimalCalc.fromSqlResult(purchaseRow?.purchase_amount, 0, 2);

  return {
    purchase_amount: purchaseAmount,
  };
}
