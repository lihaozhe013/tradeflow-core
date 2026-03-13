import { prisma } from "@/prismaClient";
import { BaseInfoData, PartnerDto, PriceDto, ProductDto } from "./types";

export async function getBaseInfoData(
  tables: string = "123",
): Promise<BaseInfoData> {
  const result: BaseInfoData = {};
  if (tables.includes("1")) result.partners = await getPartnersData();
  if (tables.includes("2")) result.products = await getProductsData();
  if (tables.includes("3")) result.prices = await getPricesData();
  return result;
}

export async function getPartnersData(): Promise<PartnerDto[]> {
  const partners = await prisma.partner.findMany({
    orderBy: {
      short_name: "asc",
    },
  });

  return partners.map((p) => ({
    ...p,
    type_name: p.type === 0 ? "Supplier" : "Customer",
  }));
}

export async function getProductsData(): Promise<ProductDto[]> {
  return await prisma.product.findMany({
    orderBy: [{ category: "asc" }, { product_model: "asc" }],
  });
}

export async function getPricesData(): Promise<PriceDto[]> {
  return await prisma.productPrice.findMany({
    orderBy: [
      { partner_short_name: "asc" },
      { product_model: "asc" },
      { effective_date: "desc" },
    ],
  });
}


