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
    Prisma.sql`inbound_date >= ${startDate}`,
    Prisma.sql`inbound_date <= ${endDate}`,
  ];

  if (supplierCode && supplierCode !== 'All') {
    purchaseSqlConditions.push(Prisma.sql`supplier_code = ${supplierCode}`);
  }

  if (productModel && productModel !== 'All') {
    purchaseSqlConditions.push(Prisma.sql`product_model = ${productModel}`);
  }

  const query = Prisma.sql`
    SELECT 
      COALESCE(SUM(quantity * unit_price), 0) as purchase_amount
    FROM inbound_records 
    WHERE ${Prisma.join(purchaseSqlConditions, ' AND ')}
  `;

  const result = await prisma.$queryRaw<PurchaseResult[]>(query);
  const purchaseRow = result[0];
  const purchaseAmount = decimalCalc.fromSqlResult(purchaseRow?.purchase_amount, 0, 2);

  return {
    purchase_amount: purchaseAmount,
  };
}
