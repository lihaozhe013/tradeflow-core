import { Prisma } from "@prisma/client";
import { prisma } from "@/prismaClient.js";
import decimalCalc from "@/utils/decimalCalculator.js";
import type { PurchaseData } from "@/routes/analysis/utils/types.js";

export function calculatePurchaseData(
  startDate: string,
  endDate: string,
  supplierCode: string | null | undefined,
  productModel: string | null | undefined,
  callback: (err: Error | null, purchaseData?: PurchaseData) => void
): void {
  (async () => {
    // Build Purchase Query Conditions
    const purchaseSqlConditions: Prisma.Sql[] = [
      Prisma.sql`inbound_date >= ${startDate}`,
      Prisma.sql`inbound_date <= ${endDate}`
    ];

    if (supplierCode && supplierCode !== "All") {
      purchaseSqlConditions.push(Prisma.sql`supplier_code = ${supplierCode}`);
    }

    if (productModel && productModel !== "All") {
      purchaseSqlConditions.push(Prisma.sql`product_model = ${productModel}`);
    }

    const query = Prisma.sql`
      SELECT 
        COALESCE(SUM(quantity * unit_price), 0) as purchase_amount
      FROM inbound_records 
      WHERE ${Prisma.join(purchaseSqlConditions, " AND ")}
    `;

    try {
      const result = await prisma.$queryRaw<any[]>(query);
      const purchaseRow = result[0];
      const purchaseAmount = decimalCalc.fromSqlResult(purchaseRow?.purchase_amount, 0, 2);

      callback(null, {
        purchase_amount: purchaseAmount,
      });
    } catch (err) {
      console.error("Failed to calculate purchase:", err);
      callback(err as Error);
    }
  })();
}
