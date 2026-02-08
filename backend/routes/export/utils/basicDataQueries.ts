import { prisma } from "@/prismaClient.js";

export default class BasicDataQueries {
  async getBaseInfoData(tables: string = "123"): Promise<any> {
    const result: any = {};
    if (tables.includes("1")) result.partners = await this.getPartnersData();
    if (tables.includes("2")) result.products = await this.getProductsData();
    if (tables.includes("3")) result.prices = await this.getPricesData();
    return result;
  }

  async getPartnersData(): Promise<any[]> {
    try {
      const partners = await prisma.partner.findMany({
        select: {
          code: true,
          short_name: true,
          full_name: true,
          type: true,
          address: true,
          contact_person: true,
          contact_phone: true,
        },
        orderBy: {
          short_name: "asc",
        },
      });

      return partners.map((p) => ({
        code: p.code,
        short_name: p.short_name,
        full_name: p.full_name,
        type_name: p.type === 0 ? "Supplier" : "Customer",
        address: p.address,
        contact_person: p.contact_person,
        contact_phone: p.contact_phone,
      }));
    } catch (error) {
      throw error;
    }
  }

  async getProductsData(): Promise<any[]> {
    try {
      return await prisma.product.findMany({
        select: {
          code: true,
          category: true,
          product_model: true,
          remark: true,
        },
        orderBy: [{ category: "asc" }, { product_model: "asc" }],
      });
    } catch (error) {
      throw error;
    }
  }

  async getPricesData(): Promise<any[]> {
    try {
      return await prisma.productPrice.findMany({
        select: {
          partner_short_name: true,
          product_model: true,
          effective_date: true,
          unit_price: true,
        },
        orderBy: [
          { partner_short_name: "asc" },
          { product_model: "asc" },
          { effective_date: "desc" },
        ],
      });
    } catch (error) {
      throw error;
    }
  }
}
