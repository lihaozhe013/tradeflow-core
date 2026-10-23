import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { authAgent } from './helpers/request';
import { periodRanges, DASHBOARD_ID, refreshDashboard } from '@/services/dashboardService';
import { startDashboardScheduler } from '@/services/dashboardScheduler';
import { prisma } from '@/prismaClient';

afterAll(async () => {
  await prisma.overviewSnapshot.deleteMany({ where: { id: DASHBOARD_ID } });
});

afterEach(() => {
  vi.useRealTimers();
});
describe('Business dashboard', () => {
  it('clips the previous month and keeps rolling windows consecutive', () => {
    const ranges = periodRanges('2024-03-31');
    expect(ranges['month']?.previous_end).toBe('2024-02-29');
    expect(ranges['30']?.start).toBe('2024-03-02');
    expect(ranges['30']?.previous_end).toBe('2024-03-01');
  });
  it('saves independent snapshots and reconciles with analysis', async () => {
    const agent = await authAgent('editor');
    const result = await agent.post('/api/overview/dashboard');
    expect(result.status).toBe(200);
    expect(await prisma.overviewSnapshot.findUnique({ where: { id: DASHBOARD_ID } })).toBeTruthy();
    for (const period of Object.values(result.body.periods) as {
      start: string;
      end: string;
      metrics: { sales: number; profit: number };
      trend: { sales: number; profit: number }[];
    }[]) {
      const analysis = await agent
        .get('/api/analysis/data')
        .query({ start_date: period.start, end_date: period.end });
      expect(period.metrics.sales).toBeCloseTo(analysis.body.data.sales_amount, 2);
      expect(period.metrics.profit).toBeCloseTo(analysis.body.data.profit_amount, 2);
      expect(period.trend.reduce((sum, r) => sum + r.sales, 0)).toBeCloseTo(
        period.metrics.sales,
        1
      );
    }
    const read = await agent.get('/api/overview/dashboard');
    expect(read.body.last_updated).toBe(result.body.last_updated);
    const reader = await authAgent('reader');
    expect((await reader.get('/api/overview/dashboard')).status).toBe(403);
  });
  it('preserves a fresh snapshot and replaces an overdue one', async () => {
    const first = await refreshDashboard();
    expect((await refreshDashboard(true)).last_updated).toBe(first.last_updated);
    await prisma.overviewSnapshot.update({
      where: { id: DASHBOARD_ID },
      data: { last_updated: new Date(0) }
    });
    expect((await refreshDashboard(true)).last_updated).not.toBe(new Date(0).toISOString());
  });
  it('does not overlap scheduled work', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const stop = startDashboardScheduler({ refresh });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    release();
  });
  it('retries failures after five minutes and stops cleanly', async () => {
    vi.useFakeTimers();
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValue(undefined);
    const stop = startDashboardScheduler({ refresh });
    await vi.advanceTimersByTimeAsync(240_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
