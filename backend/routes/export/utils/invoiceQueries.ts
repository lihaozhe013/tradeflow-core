import { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import { InvoiceFilters, InvoiceItemDto } from '@/routes/export/utils/types';

export async function getInvoiceData(filters: InvoiceFilters): Promise<InvoiceItemDto[]> {
  const { partnerCode, dateFrom, dateTo } = filters;
  if (!partnerCode) throw new Error('Partner Code is required');

  // Resolve partner codes (match against code or short_name)
  const partners = await prisma.partner.findMany({
    where: {
      OR: [{ code: partnerCode }, { short_name: partnerCode }],
    },
    select: { code: true },
  });

  if (partners.length === 0) {
    return [];
  }

  const partnerCodes = partners.map((p) => p.code);

  // Inbound query conditions
  const inboundConditions: Prisma.Sql[] = [
    Prisma.sql`supplier_code IN (${Prisma.join(partnerCodes)})`,
  ];
  if (dateFrom) inboundConditions.push(Prisma.sql`inbound_date >= ${dateFrom}`);
  if (dateTo) inboundConditions.push(Prisma.sql`inbound_date <= ${dateTo}`);

  // Outbound query conditions
  const outboundConditions: Prisma.Sql[] = [
    Prisma.sql`customer_code IN (${Prisma.join(partnerCodes)})`,
  ];
  if (dateFrom) outboundConditions.push(Prisma.sql`outbound_date >= ${dateFrom}`);
  if (dateTo) outboundConditions.push(Prisma.sql`outbound_date <= ${dateTo}`);

  // Combine queries using UNION ALL
  // Note: We select product_model, unit_price, quantity, total_price from both tables.
  // We assume unit_price is consistent for grouping or just group by it.
  // The original query grouped by product_model AND unit_price.

  const sql = Prisma.sql`
    SELECT 
      product_model,
      unit_price,
      SUM(quantity) as quantity,
      SUM(total_price) as total_price
    FROM (
      SELECT 
        product_model,
        unit_price,
        quantity,
        total_price
      FROM inbound_records 
      WHERE ${Prisma.join(inboundConditions, ' AND ')}
      UNION ALL
      SELECT 
        product_model,
        unit_price,
        quantity,
        total_price
      FROM outbound_records 
      WHERE ${Prisma.join(outboundConditions, ' AND ')}
    ) as combined_records
    GROUP BY product_model, unit_price
    ORDER BY product_model, unit_price
  `;

  interface InvoiceRawResult {
    product_model: string;
    unit_price: number | bigint;
    quantity: number | bigint;
    total_price: number | bigint;
  }
  const rows = await prisma.$queryRaw<InvoiceRawResult[]>(sql);

  // Map result to DTO, handling BigInt from SUM
  return rows.map((row) => ({
    product_model: row.product_model,
    unit_price: Number(row.unit_price),
    quantity: typeof row.quantity === 'bigint' ? Number(row.quantity) : Number(row.quantity),
    total_price:
      typeof row.total_price === 'bigint' ? Number(row.total_price) : Number(row.total_price),
  }));
}
