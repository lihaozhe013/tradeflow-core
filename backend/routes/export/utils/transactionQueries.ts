import { prisma } from "@/prismaClient.js";

export default class TransactionQueries {
  async getInboundOutboundData(filters: any = {}): Promise<any> {
    const {
      tables = "12",
      dateFrom,
      dateTo,
      productCode,
      customerCode,
    } = filters || {};
    const result: any = {};
    if (tables.includes("1")) {
      result.inbound = await this.getInboundData({
        dateFrom,
        dateTo,
        productCode,
        customerCode,
      });
    }
    if (tables.includes("2")) {
      result.outbound = await this.getOutboundData({
        dateFrom,
        dateTo,
        productCode,
        customerCode,
      });
    }
    return result;
  }

  async getInboundData(filters: any = {}): Promise<any[]> {
    try {
      const where: any = {};
      if (filters.dateFrom) where.inbound_date = { gte: filters.dateFrom };
      if (filters.dateTo) where.inbound_date = { ...where.inbound_date, lte: filters.dateTo };
      
      if (filters.productCode) {
        where.OR = [
          ...(where.OR || []),
          { product_code: { contains: filters.productCode } },
          { product_model: { contains: filters.productCode } },
        ];
      }
      if (filters.customerCode) {
        const supplierConditions = [
           { supplier_code: { contains: filters.customerCode } },
           { supplier_short_name: { contains: filters.customerCode } }
        ];
        if(where.OR) {
           where.AND = [{ OR: supplierConditions }];
        } else {
           where.OR = supplierConditions;
        }
      }

      // Note: The original logic combined productCode OR and customerCode OR with AND implictly by appending to SQL.
      // SQL: WHERE 1=1 AND (prod OR prod) AND (supp OR supp)
      // Prisma: where: { AND: [ { OR: [...prod] }, { OR: [...supp] } ] }
      
      // Let's refine the Prisma 'where' construction to strictly match the SQL logic
      const andConditions: any[] = [];
      
      if (filters.dateFrom) andConditions.push({ inbound_date: { gte: filters.dateFrom } });
      if (filters.dateTo) andConditions.push({ inbound_date: { lte: filters.dateTo } });
      
      if (filters.productCode) {
        andConditions.push({
          OR: [
            { product_code: { contains: filters.productCode } },
            { product_model: { contains: filters.productCode } }
          ]
        });
      }
      
      if (filters.customerCode) {
        andConditions.push({
          OR: [
            { supplier_code: { contains: filters.customerCode } },
            { supplier_short_name: { contains: filters.customerCode } }
          ]
        });
      }

      const finalWhere = andConditions.length > 0 ? { AND: andConditions } : {};

      const rows = await prisma.inboundRecord.findMany({
        where: finalWhere,
        select: {
          id: true,
          supplier_code: true,
          supplier_short_name: true,
          supplier_full_name: true,
          product_code: true,
          product_model: true,
          quantity: true,
          unit_price: true,
          total_price: true,
          inbound_date: true,
          invoice_date: true,
          invoice_number: true,
          receipt_number: true,
          order_number: true,
          remark: true,
        },
        orderBy: [
          { inbound_date: "desc" },
          { id: "desc" },
        ],
      });
      return rows;
    } catch (error) {
      throw error;
    }
  }

  async getOutboundData(filters: any = {}): Promise<any[]> {
    try {
      const andConditions: any[] = [];
      
      if (filters.dateFrom) andConditions.push({ outbound_date: { gte: filters.dateFrom } });
      if (filters.dateTo) andConditions.push({ outbound_date: { lte: filters.dateTo } });
      
      if (filters.productCode) {
        andConditions.push({
          OR: [
            { product_code: { contains: filters.productCode } },
            { product_model: { contains: filters.productCode } }
          ]
        });
      }
      
      if (filters.customerCode) {
        andConditions.push({
          OR: [
            { customer_code: { contains: filters.customerCode } },
            { customer_short_name: { contains: filters.customerCode } }
          ]
        });
      }

      const finalWhere = andConditions.length > 0 ? { AND: andConditions } : {};

      const rows = await prisma.outboundRecord.findMany({
        where: finalWhere,
        select: {
          id: true,
          customer_code: true,
          customer_short_name: true,
          customer_full_name: true,
          product_code: true,
          product_model: true,
          quantity: true,
          unit_price: true,
          total_price: true,
          outbound_date: true,
          invoice_date: true,
          invoice_number: true,
          receipt_number: true,
          order_number: true,
          remark: true,
        },
        orderBy: [
          { outbound_date: "desc" },
          { id: "desc" },
        ],
      });
      return rows;
    } catch (error) {
      throw error;
    }
  }
}
