import { Prisma } from "@prisma/client";
import { prisma } from "@/prismaClient.js";

type Row = Record<string, any>;

export default class AnalysisQueries {
  /**
   * Get customer analysis data with product details
   */
  async getCustomerAnalysisData(
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    try {
      const customerSalesSql = Prisma.sql`
        SELECT 
          p.code as customer_code,
          p.full_name as customer_name,
          o.product_model,
          SUM(o.quantity) as total_quantity,
          SUM(o.total_price) as sales_amount
        FROM outbound_records o
        LEFT JOIN partners p ON (o.customer_code = p.code OR o.customer_short_name = p.short_name)
        WHERE o.outbound_date >= ${startDate} AND o.outbound_date <= ${endDate}
        AND p.code IS NOT NULL
        AND o.unit_price >= 0
        GROUP BY p.code, p.full_name, o.product_model
        ORDER BY p.full_name, o.product_model
      `;

      const salesData = await prisma.$queryRaw<Row[]>(customerSalesSql);
      if (!salesData || salesData.length === 0) return [];

      const avgCostSql = Prisma.sql`
          SELECT 
            product_model,
            SUM(quantity * unit_price) / SUM(quantity) as avg_cost_price
          FROM inbound_records 
          WHERE unit_price >= 0
          GROUP BY product_model
        `;

      const costData = await prisma.$queryRaw<Row[]>(avgCostSql);
      const costMap: Record<string, number> = {};
      (costData || []).forEach((item) => {
        const avgCost = item["avg_cost_price"];
        costMap[item["product_model"]] = typeof avgCost === 'bigint' ? Number(avgCost) : (Number(avgCost) || 0);
      });

      const customerMap: Record<string, any> = {};
      (salesData || []).forEach((row) => {
        const customerCode = row["customer_code"];
        const customerName = row["customer_name"];
        const productModel = row["product_model"];
        const salesAmountVal = row["sales_amount"];
        const salesAmount = typeof salesAmountVal === 'bigint' ? Number(salesAmountVal) : (Number(salesAmountVal) || 0);
        const quantityVal = row["total_quantity"];
        const quantity = typeof quantityVal === 'bigint' ? Number(quantityVal) : (Number(quantityVal) || 0);
        const avgCostPrice = costMap[productModel] || 0;
        const costAmount = avgCostPrice * quantity;
        const profitAmount = salesAmount - costAmount;
        const profitRate =
          salesAmount > 0 ? (profitAmount / salesAmount) * 100 : 0;

        if (!customerMap[customerCode]) {
          customerMap[customerCode] = {
            customer_code: customerCode,
            customer_name: customerName,
            sales_amount: 0,
            cost_amount: 0,
            profit_amount: 0,
            profit_rate: 0,
            product_details: [] as any[],
          };
        }

        customerMap[customerCode].sales_amount += salesAmount;
        customerMap[customerCode].cost_amount += costAmount;
        customerMap[customerCode].profit_amount += profitAmount;
        customerMap[customerCode].product_details.push({
          product_model: productModel,
          sales_amount: salesAmount,
          cost_amount: costAmount,
          profit_amount: profitAmount,
          profit_rate: profitRate,
        });
      });

      Object.values(customerMap).forEach((customer: any) => {
        customer.profit_rate =
          customer.sales_amount > 0
            ? (customer.profit_amount / customer.sales_amount) * 100
            : 0;
      });

      const result = Object.values(customerMap).sort(
        (a: any, b: any) => b.sales_amount - a.sales_amount
      );
      return result;
    } catch (error) {
      throw error as Error;
    }
  }

  /**
   * Get product analysis data with customer details
   */
  async getProductAnalysisData(
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    try {
      const productSalesSql = Prisma.sql`
        SELECT 
          o.product_model,
          p.code as customer_code,
          p.full_name as customer_name,
          SUM(o.quantity) as total_quantity,
          SUM(o.total_price) as sales_amount
        FROM outbound_records o
        LEFT JOIN partners p ON (o.customer_code = p.code OR o.customer_short_name = p.short_name)
        WHERE o.outbound_date >= ${startDate} AND o.outbound_date <= ${endDate}
        AND p.code IS NOT NULL
        AND o.unit_price >= 0
        GROUP BY o.product_model, p.code, p.full_name
        ORDER BY o.product_model, p.full_name
      `;

      const salesData = await prisma.$queryRaw<Row[]>(productSalesSql);
      if (!salesData || salesData.length === 0) return [];

      const avgCostSql = Prisma.sql`
          SELECT 
            product_model,
            SUM(quantity * unit_price) / SUM(quantity) as avg_cost_price
          FROM inbound_records 
          WHERE unit_price >= 0
          GROUP BY product_model
        `;

      const costData = await prisma.$queryRaw<Row[]>(avgCostSql);
      const costMap: Record<string, number> = {};
      (costData || []).forEach((item) => {
        const avgCost = item["avg_cost_price"];
        costMap[item["product_model"]] = typeof avgCost === 'bigint' ? Number(avgCost) : (Number(avgCost) || 0);
      });

      const productMap: Record<string, any> = {};
      (salesData || []).forEach((row) => {
        const productModel = row["product_model"];
        const customerCode = row["customer_code"];
        const customerName = row["customer_name"];
        const salesAmountVal = row["sales_amount"];
        const salesAmount = typeof salesAmountVal === 'bigint' ? Number(salesAmountVal) : (Number(salesAmountVal) || 0);
        const quantityVal = row["total_quantity"];
        const quantity = typeof quantityVal === 'bigint' ? Number(quantityVal) : (Number(quantityVal) || 0);
        const avgCostPrice = costMap[productModel] || 0;
        const costAmount = avgCostPrice * quantity;
        const profitAmount = salesAmount - costAmount;
        const profitRate =
          salesAmount > 0 ? (profitAmount / salesAmount) * 100 : 0;

        if (!productMap[productModel]) {
          productMap[productModel] = {
            product_model: productModel,
            sales_amount: 0,
            cost_amount: 0,
            profit_amount: 0,
            profit_rate: 0,
            customer_details: [] as any[],
          };
        }

        productMap[productModel].sales_amount += salesAmount;
        productMap[productModel].cost_amount += costAmount;
        productMap[productModel].profit_amount += profitAmount;
        productMap[productModel].customer_details.push({
          customer_code: customerCode,
          customer_name: customerName,
          sales_amount: salesAmount,
          cost_amount: costAmount,
          profit_amount: profitAmount,
          profit_rate: profitRate,
        });
      });

      Object.values(productMap).forEach((product: any) => {
        product.profit_rate =
          product.sales_amount > 0
            ? (product.profit_amount / product.sales_amount) * 100
            : 0;
      });

      const result = Object.values(productMap)
        .filter(
          (product: any) =>
            product.product_model && product.product_model.trim() !== ""
        )
        .sort((a: any, b: any) => b.sales_amount - a.sales_amount);
      return result;
    } catch (error) {
      throw error as Error;
    }
  }
}
