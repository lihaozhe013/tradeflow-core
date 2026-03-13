import { prisma } from '@/prismaClient';
import type { FilterOptions } from '@/routes/analysis/utils/types';

/**
 * Retrieve filter options (customer and product lists)
 */
export async function getFilterOptions(): Promise<FilterOptions> {
  const [customers, suppliers, products] = await Promise.all([
    prisma.partner.findMany({
      where: { type: 1 },
      orderBy: { short_name: 'asc' },
      select: { code: true, short_name: true, full_name: true },
    }),
    prisma.partner.findMany({
      where: { type: 0 },
      orderBy: { short_name: 'asc' },
      select: { code: true, short_name: true, full_name: true },
    }),
    prisma.product.findMany({
      orderBy: { product_model: 'asc' },
      select: { code: true, product_model: true },
    }),
  ]);

  const customerOptions: FilterOptions['customers'] = [
    { code: 'All', name: 'All' },
    ...customers.map((c) => ({
      code: c.code || '',
      name: `${c.short_name} (${c.full_name})`,
    })),
  ];

  const supplierOptions: FilterOptions['suppliers'] = [
    { code: 'All', name: 'All' },
    ...suppliers.map((s) => ({
      code: s.code || '',
      name: `${s.short_name} (${s.full_name})`,
    })),
  ];

  const productOptions: FilterOptions['products'] = [
    { model: 'All', name: 'All' },
    ...products.map((p) => ({
      model: p.product_model || '',
      name: p.product_model || '',
    })),
  ];

  return {
    customers: customerOptions,
    suppliers: supplierOptions,
    products: productOptions,
  };
}
