import { Hono } from 'hono';
import { getDashboard, refreshDashboard } from '@/services/dashboardService';
import { getOverviewSnapshot, refreshOverviewSnapshot } from '@/services/overviewSnapshotService';
import { SnapshotError } from '@/services/snapshotRefresh';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

async function requireSnapshot() {
  const snapshot = await getOverviewSnapshot();
  if (!snapshot) {
    throw new SnapshotError(
      503,
      'SNAPSHOT_NOT_READY',
      'Statistics data not generated, please refresh first.'
    );
  }
  return snapshot;
}

app.get('/dashboard', async (c) => {
  const data = await getDashboard();
  if (!data) throw new SnapshotError(503, 'SNAPSHOT_NOT_READY', 'Dashboard is not ready.');
  return c.json(data);
});

app.post('/dashboard', async (c) => {
  return c.json(await refreshDashboard());
});

app.get('/stats', async (c) => {
  return c.json(await requireSnapshot());
});

app.post('/stats', async (c) => {
  return c.json(await refreshOverviewSnapshot());
});

app.get('/top-sales-products', async (c) => {
  const snapshot = await requireSnapshot();
  return c.json({
    success: true,
    data: snapshot.top_sales_products,
    last_updated: snapshot.last_updated
  });
});

app.get('/monthly-inventory-change/:productModel', async (c) => {
  const snapshot = await requireSnapshot();
  const model = c.req.param('productModel');
  const data = Object.hasOwn(snapshot.monthly_inventory_changes, model)
    ? snapshot.monthly_inventory_changes[model]
    : undefined;
  return c.json(
    data
      ? { success: true, data, last_updated: snapshot.last_updated }
      : {
          success: false,
          message:
            'Monthly inventory change data not found for this product, please refresh statistics first'
        }
  );
});

export default app;
