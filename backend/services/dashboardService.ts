import { z } from 'zod';
import { prisma } from '@/prismaClient';
import { refreshSnapshot, parseSnapshot } from './snapshotRefresh';
import { calculateSoldGoodsAllocations } from '@/routes/analysis/utils/costCalculator';
import { listAccountBalances } from './readService';
import { getAuthConfig } from '@/utils/auth';
import decimalCalc from '@/utils/decimalCalculator';

export const DASHBOARD_ID = 'dashboard:v1';
export const REFRESH_INTERVAL = 86_400_000;
const metricsSchema = z.object({
  sales: z.number(),
  purchase: z.number(),
  cost: z.number(),
  profit: z.number(),
  margin: z.number().nullable(),
  inbound: z.number(),
  outbound: z.number()
});
const rankSchema = z.object({
  code: z.string(),
  name: z.string(),
  amount: z.number(),
  count: z.number()
});
const stockSchema = z.object({
  product_model: z.string(),
  quantity: z.number(),
  recent_quantity: z.number(),
  last_outbound: z.string().nullable()
});
export const dashboardSchema = z.object({
  version: z.literal(1),
  as_of_date: z.string(),
  periods: z.record(
    z.string(),
    z.object({
      start: z.string(),
      end: z.string(),
      previous_start: z.string(),
      previous_end: z.string(),
      metrics: metricsSchema,
      previous: metricsSchema,
      trend: z.array(
        z.object({ start: z.string(), end: z.string(), sales: z.number(), profit: z.number() })
      ),
      products: z.array(rankSchema),
      customers: z.array(rankSchema)
    })
  ),
  funds: z.object({
    receivable: z.number(),
    payable: z.number(),
    receivable_count: z.number(),
    payable_count: z.number(),
    customers: z.array(rankSchema),
    suppliers: z.array(rankSchema)
  }),
  attention: z.object({
    review_enabled: z.boolean(),
    inbound: z.number(),
    outbound: z.number(),
    negative: z.array(stockSchema),
    zero: z.array(stockSchema)
  })
});
export type DashboardData = z.infer<typeof dashboardSchema>;
export const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
export function periodRanges(end: string) {
  const date = new Date(end + 'T00:00:00Z');
  const previousMonthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
  const previousEnd = new Date(
    Date.UTC(
      previousMonthEnd.getUTCFullYear(),
      previousMonthEnd.getUTCMonth(),
      Math.min(date.getUTCDate(), previousMonthEnd.getUTCDate())
    )
  )
    .toISOString()
    .slice(0, 10);
  return Object.fromEntries(
    ['month', '30', '90', '365'].map((key) => {
      const start = key === 'month' ? end.slice(0, 7) + '-01' : shiftDate(end, 1 - Number(key));
      return [
        key,
        {
          start,
          end,
          previous_start:
            key === 'month' ? previousEnd.slice(0, 7) + '-01' : shiftDate(start, -Number(key)),
          previous_end: key === 'month' ? previousEnd : shiftDate(start, -1)
        }
      ];
    })
  );
}
const money = (values: number[]) =>
  decimalCalc.toDbNumber(
    values.reduce((sum, value) => sum.add(value), decimalCalc.decimal(0)),
    2
  );
const validDate = (value: string | null): value is string =>
  !!value &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
function response(data: DashboardData, updated: Date) {
  return {
    ...data,
    last_updated: updated.toISOString(),
    next_auto_refresh_at: new Date(updated.getTime() + REFRESH_INTERVAL).toISOString()
  };
}
export async function getDashboard() {
  const row = await prisma.overviewSnapshot.findUnique({ where: { id: DASHBOARD_ID } });
  return row ? response(parseSnapshot(dashboardSchema, row.data), row.last_updated) : null;
}
export async function refreshDashboard(onlyIfDue = false, now = new Date()) {
  return refreshSnapshot('overview:' + DASHBOARD_ID, async (tx) => {
    const existing = await tx.overviewSnapshot.findUnique({ where: { id: DASHBOARD_ID } });
    if (onlyIfDue && existing && now.getTime() - existing.last_updated.getTime() < REFRESH_INTERVAL)
      return response(parseSnapshot(dashboardSchema, existing.data), existing.last_updated);
    const end = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
    const [inbounds, outbounds, inventory, receivable, payable, pending, allocations] =
      await Promise.all([
        tx.inboundRecord.findMany(),
        tx.outboundRecord.findMany({ include: { product: true, partner: true } }),
        tx.inventory.findMany(),
        listAccountBalances(tx, { kind: 'receivable', page: 1, limit: 5 }),
        listAccountBalances(tx, { kind: 'payable', page: 1, limit: 5 }),
        tx.transactionDraft.groupBy({
          by: ['direction'],
          where: { status: 'pending' },
          _count: true
        }),
        calculateSoldGoodsAllocations('0001-01-01', end, null, null, tx)
      ]);
    const costs = new Map(allocations.map((row) => [row.id, row.cost]));
    const metrics = (start: string, finish: string) => {
      const ins = inbounds.filter(
        (r) => validDate(r.inbound_date) && r.inbound_date >= start && r.inbound_date <= finish
      );
      const outs = outbounds.filter(
        (r) => validDate(r.outbound_date) && r.outbound_date >= start && r.outbound_date <= finish
      );
      const sales = money(
        outs.map((r) =>
          (r.unit_price ?? 0) < 0
            ? -Math.abs((r.quantity ?? 0) * (r.unit_price ?? 0))
            : (r.quantity ?? 0) * (r.unit_price ?? 0)
        )
      );
      const cost = money(outs.map((r) => costs.get(r.id) ?? 0));
      const profit = money([sales, -cost]);
      return {
        sales,
        cost,
        profit,
        margin: sales > 0 ? Number(((profit / sales) * 100).toFixed(2)) : null,
        purchase: money(ins.map((r) => (r.quantity ?? 0) * (r.unit_price ?? 0))),
        inbound: ins.length,
        outbound: outs.length
      };
    };
    const periods: DashboardData['periods'] = {};
    for (const [key, range] of Object.entries(periodRanges(end))) {
      const selected = outbounds.filter(
        (r) =>
          validDate(r.outbound_date) && r.outbound_date >= range.start && r.outbound_date <= end
      );
      const ranks = (kind: 'product' | 'customer') => {
        const groups = new Map<
          string,
          { code: string; name: string; values: number[]; count: number }
        >();
        for (const row of selected) {
          const code = kind === 'product' ? (row.product_code ?? '') : row.customer_code;
          const name =
            kind === 'product' ? (row.product?.product_model ?? code) : row.partner.short_name;
          const group = groups.get(code) ?? { code, name, values: [], count: 0 };
          group.values.push(
            (row.unit_price ?? 0) < 0
              ? -Math.abs((row.quantity ?? 0) * (row.unit_price ?? 0))
              : (row.quantity ?? 0) * (row.unit_price ?? 0)
          );
          group.count++;
          groups.set(code, group);
        }
        return [...groups.values()]
          .map((g) => ({ code: g.code, name: g.name, amount: money(g.values), count: g.count }))
          .sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code))
          .slice(0, 5);
      };
      const trend = [];
      for (let start = range.start; start <= end;) {
        const next =
          key === '365'
            ? new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1))
                .toISOString()
                .slice(0, 10)
            : shiftDate(start, key === '90' ? 7 : 1);
        const finish = shiftDate(next, -1) < end ? shiftDate(next, -1) : end;
        const value = metrics(start, finish);
        trend.push({ start, end: finish, sales: value.sales, profit: value.profit });
        start = next;
      }
      const totals = metrics(range.start, end);
      const lastBucket = trend.at(-1);
      if (lastBucket) {
        lastBucket.sales = money([
          lastBucket.sales,
          totals.sales,
          -money(trend.map((row) => row.sales))
        ]);
        lastBucket.profit = money([
          lastBucket.profit,
          totals.profit,
          -money(trend.map((row) => row.profit))
        ]);
      }
      periods[key] = {
        ...range,
        metrics: totals,
        previous: metrics(range.previous_start, range.previous_end),
        trend,
        products: ranks('product'),
        customers: ranks('customer')
      };
    }
    const recent = outbounds.filter(
      (r) =>
        validDate(r.outbound_date) &&
        r.outbound_date >= shiftDate(end, -29) &&
        r.outbound_date <= end &&
        (r.quantity ?? 0) > 0
    );
    const stocks = inventory
      .map((row) => {
        const rows = recent.filter((r) => r.product?.product_model === row.product_model);
        return {
          ...row,
          recent_quantity: rows.reduce((sum, r) => sum + (r.quantity ?? 0), 0),
          last_outbound:
            outbounds
              .filter(
                (r) =>
                  r.product?.product_model === row.product_model &&
                  validDate(r.outbound_date) &&
                  r.outbound_date <= end &&
                  (r.quantity ?? 0) > 0
              )
              .map((r) => r.outbound_date!)
              .sort()
              .at(-1) ?? null
        };
      })
      .sort((a, b) => a.quantity - b.quantity || a.product_model.localeCompare(b.product_model));
    const accountRanks = (account: typeof receivable) =>
      account.data
        .filter((r) => r.balance > 0)
        .map((r) => ({
          code: r.partner_code,
          name: r.short_name,
          amount: r.balance,
          count: r.payment_count
        }));
    const data = dashboardSchema.parse({
      version: 1,
      as_of_date: end,
      periods,
      funds: {
        receivable: receivable.summary.total_outstanding,
        payable: payable.summary.total_outstanding,
        receivable_count: receivable.summary.partner_count - receivable.summary.settled_count,
        payable_count: payable.summary.partner_count - payable.summary.settled_count,
        customers: accountRanks(receivable),
        suppliers: accountRanks(payable)
      },
      attention: {
        review_enabled: getAuthConfig().enabled,
        inbound: pending.find((r) => r.direction === 'inbound')?._count ?? 0,
        outbound: pending.find((r) => r.direction === 'outbound')?._count ?? 0,
        negative: stocks.filter((r) => r.quantity < 0),
        zero: stocks.filter((r) => r.quantity === 0 && r.recent_quantity > 0)
      }
    });
    const updated = new Date();
    await tx.overviewSnapshot.upsert({
      where: { id: DASHBOARD_ID },
      create: { id: DASHBOARD_ID, data, last_updated: updated },
      update: { data, last_updated: updated }
    });
    return response(data, updated);
  });
}
