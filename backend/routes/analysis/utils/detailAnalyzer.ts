import { Prisma } from "@prisma/client";
import { prisma } from "@/prismaClient.js";
import decimalCalc from "@/utils/decimalCalculator.js";
import { calculateFilteredSoldGoodsCost } from "@/routes/analysis/utils/costCalculator.js";
import type { DetailItem, AnalysisType } from "@/routes/analysis/utils/types.js";

/**
 * Calculate detailed analytical data (grouped by customer or product)
 */
export function calculateDetailAnalysis(
  startDate: string,
  endDate: string,
  partnerCode: string | null | undefined, // Generalized customerCode argument
  productModel: string | null | undefined,
  analysisType: AnalysisType = 'outbound',
  callback: (err: Error | null, detailData?: DetailItem[]) => void
): void {
  // Determine the grouping type
  const groupByPartner = !partnerCode || partnerCode === "All";
  const groupByProduct = !productModel || productModel === "All";

  if (analysisType === 'inbound') {
    handleInboundAnalysis(startDate, endDate, partnerCode, productModel, groupByPartner, groupByProduct, callback);
    return;
  }

  handleOutboundAnalysis(startDate, endDate, partnerCode, productModel, groupByPartner, groupByProduct, callback);
}

function handleInboundAnalysis(
  startDate: string,
  endDate: string,
  supplierCode: string | null | undefined,
  productModel: string | null | undefined,
  groupBySupplier: boolean,
  _groupByProduct: boolean,
  callback: (err: Error | null, detailData?: DetailItem[]) => void
) {
  (async () => {
    // Logic: Group by Supplier if Supplier is "All", otherwise Group by Product
    const groupField = groupBySupplier ? Prisma.sql`supplier_code` : Prisma.sql`product_model`;

    // Only select the necessary columns to avoid GROUP BY issues in Postgres
    const selectCols = groupBySupplier 
        ? Prisma.sql`${groupField} as group_key, supplier_code` 
        : Prisma.sql`${groupField} as group_key, product_model`;
    
    // Group only by relevant columns
    const groupByCols = groupBySupplier
        ? Prisma.sql`${groupField}, supplier_code`
        : Prisma.sql`${groupField}, product_model`;

    const conditions: Prisma.Sql[] = [];
    
    // Date comparison (lexicographical for ISO strings)
    conditions.push(Prisma.sql`inbound_date >= ${startDate}`);
    conditions.push(Prisma.sql`inbound_date <= ${endDate}`);

    if (supplierCode && supplierCode !== 'All') {
        conditions.push(Prisma.sql`supplier_code = ${supplierCode}`);
    }
    if (productModel && productModel !== 'All') {
        conditions.push(Prisma.sql`product_model = ${productModel}`);
    }

    const inboundSql = Prisma.sql`
      SELECT 
        ${selectCols},
        SUM(CASE WHEN unit_price >= 0 THEN quantity * unit_price ELSE 0 END) as normal_purchase,
        SUM(CASE WHEN unit_price < 0 THEN ABS(quantity * unit_price) ELSE 0 END) as special_income
      FROM inbound_records 
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY ${groupByCols}
    `;

    try {
      const inboundGroups = await prisma.$queryRaw<any[]>(inboundSql);
      const results: DetailItem[] = inboundGroups.map(group => {
        const normalPurchase = decimalCalc.fromSqlResult(group.normal_purchase, 0, 2);
        const specialIncome = decimalCalc.fromSqlResult(group.special_income, 0, 2);
        const purchaseAmount = decimalCalc.toDbNumber(
          decimalCalc.subtract(normalPurchase, specialIncome),
          2
        );

        return {
          group_key: group.group_key,
          supplier_code: groupBySupplier ? group.group_key : (supplierCode || undefined), 
          product_model: groupBySupplier ? (productModel || undefined) : group.group_key,
          purchase_amount: purchaseAmount
        };
      });
      
      callback(null, results);
    } catch (err) {
      callback(err as Error);
    }
  })();
}

function handleOutboundAnalysis(
  startDate: string,
  endDate: string,
  customerCode: string | null | undefined,
  productModel: string | null | undefined,
  groupByCustomer: boolean,
  _groupByProduct: boolean,
  callback: (err: Error | null, detailData?: DetailItem[]) => void
) {
  (async () => {
    // Logic: Group by Customer if Customer is "All", otherwise Group by Product
    const groupField = groupByCustomer ? Prisma.sql`customer_code` : Prisma.sql`product_model`;

    // Only select the necessary columns
    const selectCols = groupByCustomer 
        ? Prisma.sql`${groupField} as group_key, customer_code` 
        : Prisma.sql`${groupField} as group_key, product_model`;
    
    // Group only by relevant columns
    const groupByCols = groupByCustomer
        ? Prisma.sql`${groupField}, customer_code`
        : Prisma.sql`${groupField}, product_model`;

    const conditions: Prisma.Sql[] = [];
    
    // Date comparison
    conditions.push(Prisma.sql`outbound_date >= ${startDate}`);
    conditions.push(Prisma.sql`outbound_date <= ${endDate}`);

    if (customerCode && customerCode !== 'All') {
        conditions.push(Prisma.sql`customer_code = ${customerCode}`);
    }
    if (productModel && productModel !== 'All') {
        conditions.push(Prisma.sql`product_model = ${productModel}`);
    }

    // Retrieve all relevant outbound records
    const outboundSql = Prisma.sql`
      SELECT 
        ${selectCols},
        SUM(CASE WHEN unit_price >= 0 THEN quantity * unit_price ELSE 0 END) as normal_sales,
        SUM(CASE WHEN unit_price < 0 THEN ABS(quantity * unit_price) ELSE 0 END) as special_expense
      FROM outbound_records 
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY ${groupByCols}
    `;

    try {
      const outboundGroups = await prisma.$queryRaw<any[]>(outboundSql);

      if (!outboundGroups || outboundGroups.length === 0) {
        callback(null, []);
        return;
      }

            // Calculate the detailed data for each group
            const detailPromises = outboundGroups.map((group: any) => {
              return new Promise<DetailItem | null>((resolve, reject) => {
                const groupKey = group.group_key as string;
                
                // If grouped by customer, key is customer -> Product is All
                // If grouped by product, key is product -> Customer is All/Specific (from filter params)
                const currentCustomerCode = groupByCustomer
                  ? groupKey
                  : customerCode;
                  
                const currentProductModel = groupByCustomer
                  ? productModel // Should be "All" or undefined if grouped by customer
                  : groupKey;

                // Calculate the cost of this grouping
                calculateFilteredSoldGoodsCost(
                  startDate,
                  endDate,
                  currentCustomerCode === "All" ? null : currentCustomerCode,
                  currentProductModel === "All" ? null : currentProductModel,
                  (costErr, costAmount) => {
                    if (costErr) return reject(costErr);

                    const normalSales = decimalCalc.fromSqlResult(
                      group.normal_sales,
                      0,
                      2
                    );
                    const specialExpense = decimalCalc.fromSqlResult(
                      group.special_expense,
                      0,
                      2
                    );
                    const salesAmount = decimalCalc.toDbNumber(
                      decimalCalc.subtract(normalSales, specialExpense),
                      2
                    );
                    const cost = decimalCalc.toDbNumber(costAmount ?? 0, 2);
                    const profit = decimalCalc.toDbNumber(
                      decimalCalc.subtract(salesAmount, cost),
                      2
                    );

                    // Calculate the profit margin
                    let profitRate = 0;
                    if (salesAmount > 0) {
                      const rate = decimalCalc.multiply(
                        decimalCalc.divide(profit, salesAmount),
                        100
                      );
                      profitRate = decimalCalc.toDbNumber(rate, 2);
                    }

                    if (salesAmount !== 0) {
                      resolve({
                        group_key: groupKey,
                        customer_code: currentCustomerCode ?? undefined,
                        product_model: currentProductModel ?? undefined,
                        sales_amount: salesAmount,
                        cost_amount: cost,
                        profit_amount: profit,
                        profit_rate: profitRate,
                      });
                    } else {
                      resolve(null);
                    }
                  }
                );
              });
            });

      Promise.all(detailPromises)
        .then((results) => {
          const validResults = results.filter(
            (item): item is DetailItem => item !== null
          );
          callback(null, validResults);
        })
        .catch((e) => callback(e as Error));
    } catch (err) {
      callback(err as Error);
    }
  })();
}
