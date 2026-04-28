import { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';
import { calculateFilteredSoldGoodsCost } from '@/routes/analysis/utils/costCalculator';
import type { DetailItem, AnalysisType } from '@/routes/analysis/utils/types';

interface InboundGroupResult {
  group_key: string;
  supplement_code?: string; // Potential dynamic field
  product_model?: string;
  normal_purchase: number | null; // Prisma/SQL sums can be null
  special_income: number | null;
}

interface OutboundGroupResult {
  group_key: string;
  customer_code?: string;
  product_model?: string;
  normal_sales: number | null;
  special_expense: number | null;
}

/**
 * Calculate detailed analytical data (grouped by customer or product)
 */
export async function calculateDetailAnalysis(
  startDate: string,
  endDate: string,
  partnerCode: string | null | undefined, // Generalized customerCode argument
  productModel: string | null | undefined,
  analysisType: AnalysisType = 'outbound',
): Promise<DetailItem[]> {
  // Determine the grouping type
  const groupByPartner = !partnerCode || partnerCode === 'All';
  const groupByProduct = !productModel || productModel === 'All';

  if (analysisType === 'inbound') {
    return handleInboundAnalysis(
      startDate,
      endDate,
      partnerCode,
      productModel,
      groupByPartner,
      groupByProduct,
    );
  }

  return handleOutboundAnalysis(
    startDate,
    endDate,
    partnerCode,
    productModel,
    groupByPartner,
    groupByProduct,
  );
}

async function handleInboundAnalysis(
  startDate: string,
  endDate: string,
  supplierCode: string | null | undefined,
  productModel: string | null | undefined,
  groupBySupplier: boolean,
  _groupByProduct: boolean,
): Promise<DetailItem[]> {
  // Logic: Group by Supplier if Supplier is "All", otherwise Group by Product
  const groupField = groupBySupplier ? Prisma.sql`r.supplier_code` : Prisma.sql`p.product_model`;

  // Only select the necessary columns to avoid GROUP BY issues in Postgres
  const selectCols = groupBySupplier
    ? Prisma.sql`${groupField} as group_key, r.supplier_code as supplier_code`
    : Prisma.sql`${groupField} as group_key, p.product_model as product_model`;

  // Group only by relevant columns
  const groupByCols = groupBySupplier
    ? Prisma.sql`${groupField}, r.supplier_code`
    : Prisma.sql`${groupField}, p.product_model`;

  const conditions: Prisma.Sql[] = [];

  // Date comparison (lexicographical for ISO strings)
  conditions.push(Prisma.sql`r.inbound_date >= ${startDate}`);
  conditions.push(Prisma.sql`r.inbound_date <= ${endDate}`);

  if (supplierCode && supplierCode !== 'All') {
    conditions.push(Prisma.sql`r.supplier_code = ${supplierCode}`);
  }
  if (productModel && productModel !== 'All') {
    conditions.push(Prisma.sql`p.product_model = ${productModel}`);
  }

  const inboundSql = Prisma.sql`
      SELECT 
        ${selectCols},
        SUM(CASE WHEN r.unit_price >= 0 THEN r.quantity * r.unit_price ELSE 0 END) as normal_purchase,
        SUM(CASE WHEN r.unit_price < 0 THEN ABS(r.quantity * r.unit_price) ELSE 0 END) as special_income
      FROM inbound_records r
      LEFT JOIN products p ON r.product_code = p.code
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY ${groupByCols}
    `;

  const inboundGroups = await prisma.$queryRaw<InboundGroupResult[]>(inboundSql);
  const results: DetailItem[] = inboundGroups.map((group) => {
    const normalPurchase = decimalCalc.fromSqlResult(group.normal_purchase, 0, 2);
    const specialIncome = decimalCalc.fromSqlResult(group.special_income, 0, 2);
    const purchaseAmount = decimalCalc.toDbNumber(
      decimalCalc.subtract(normalPurchase, specialIncome),
      2,
    );

    return {
      group_key: group.group_key,
      supplier_code: groupBySupplier ? group.group_key : supplierCode || undefined,
      product_model: groupBySupplier ? productModel || undefined : group.group_key,
      purchase_amount: purchaseAmount,
    };
  });

  return results;
}

async function handleOutboundAnalysis(
  startDate: string,
  endDate: string,
  customerCode: string | null | undefined,
  productModel: string | null | undefined,
  groupByCustomer: boolean,
  _groupByProduct: boolean,
): Promise<DetailItem[]> {
  // Logic: Group by Customer if Customer is "All", otherwise Group by Product
  const groupField = groupByCustomer ? Prisma.sql`r.customer_code` : Prisma.sql`p.product_model`;

  // Only select the necessary columns
  const selectCols = groupByCustomer
    ? Prisma.sql`${groupField} as group_key, r.customer_code as customer_code`
    : Prisma.sql`${groupField} as group_key, p.product_model as product_model`;

  // Group only by relevant columns
  const groupByCols = groupByCustomer
    ? Prisma.sql`${groupField}, r.customer_code`
    : Prisma.sql`${groupField}, p.product_model`;

  const conditions: Prisma.Sql[] = [];

  // Date comparison
  conditions.push(Prisma.sql`r.outbound_date >= ${startDate}`);
  conditions.push(Prisma.sql`r.outbound_date <= ${endDate}`);

  if (customerCode && customerCode !== 'All') {
    conditions.push(Prisma.sql`r.customer_code = ${customerCode}`);
  }
  if (productModel && productModel !== 'All') {
    conditions.push(Prisma.sql`p.product_model = ${productModel}`);
  }

  // Retrieve all relevant outbound records
  const outboundSql = Prisma.sql`
    SELECT 
      ${selectCols},
      SUM(CASE WHEN r.unit_price >= 0 THEN r.quantity * r.unit_price ELSE 0 END) as normal_sales,
      SUM(CASE WHEN r.unit_price < 0 THEN ABS(r.quantity * r.unit_price) ELSE 0 END) as special_expense
    FROM outbound_records r
    LEFT JOIN products p ON r.product_code = p.code
    WHERE ${Prisma.join(conditions, ' AND ')}
    GROUP BY ${groupByCols}
  `;

  const outboundGroups = await prisma.$queryRaw<OutboundGroupResult[]>(outboundSql);

  if (!outboundGroups || outboundGroups.length === 0) {
    return [];
  }

  // Calculate the detailed data for each group
  const detailPromises = outboundGroups.map(async (group) => {
    const groupKey = group.group_key;

    // If grouped by customer, key is customer -> Product is All
    // If grouped by product, key is product -> Customer is All/Specific (from filter params)
    const currentCustomerCode = groupByCustomer ? groupKey : customerCode;

    const currentProductModel = groupByCustomer
      ? productModel // Should be "All" or undefined if grouped by customer
      : groupKey;

    // Calculate the cost of this grouping
    const costAmount = await calculateFilteredSoldGoodsCost(
      startDate,
      endDate,
      currentCustomerCode === 'All' ? null : currentCustomerCode,
      currentProductModel === 'All' ? null : currentProductModel,
    );

    const normalSales = decimalCalc.fromSqlResult(group.normal_sales, 0, 2);
    const specialExpense = decimalCalc.fromSqlResult(group.special_expense, 0, 2);
    const salesAmount = decimalCalc.toDbNumber(
      decimalCalc.subtract(normalSales, specialExpense),
      2,
    );
    const cost = decimalCalc.toDbNumber(costAmount ?? 0, 2);
    const profit = decimalCalc.toDbNumber(decimalCalc.subtract(salesAmount, cost), 2);

    // Calculate the profit margin
    let profitRate = 0;
    if (salesAmount !== 0) {
      const rate = decimalCalc.multiply(decimalCalc.divide(profit, salesAmount), 100);
      profitRate = decimalCalc.toDbNumber(rate, 2);
    }

    if (salesAmount !== 0) {
      return {
        group_key: groupKey,
        customer_code: currentCustomerCode ?? undefined,
        product_model: currentProductModel ?? undefined,
        sales_amount: salesAmount,
        cost_amount: cost,
        profit_amount: profit,
        profit_rate: profitRate,
      } as DetailItem;
    } else {
      return null;
    }
  });

  const results = await Promise.all(detailPromises);
  const validResults = results.filter((item): item is DetailItem => item !== null);
  return validResults;
}
