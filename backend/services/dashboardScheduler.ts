import { refreshDashboard } from './dashboardService';
import { logger } from '@/utils/logger';
export function startDashboardScheduler(
  options: { now?: () => number; refresh?: () => Promise<unknown> } = {}
) {
  const now = options.now ?? Date.now;
  const refresh = options.refresh ?? (() => refreshDashboard(true));
  let pending = false;
  let retryAt = 0;
  let stopped = false;
  const tick = async () => {
    if (stopped || pending || now() < retryAt) return;
    pending = true;
    const started = now();
    try {
      await refresh();
      retryAt = 0;
    } catch (error) {
      retryAt = now() + 300_000;
      logger.warn('Dashboard refresh deferred.', {
        duration_ms: now() - started,
        error_class: error instanceof Error ? error.name : 'UnknownError'
      });
    } finally {
      pending = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, 60_000);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
