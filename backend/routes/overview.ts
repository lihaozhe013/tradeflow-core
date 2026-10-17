import express, { type Router } from 'express';
import { getOverviewSnapshot, refreshOverviewSnapshot } from '@/services/overviewSnapshotService';
import { SnapshotError } from '@/services/snapshotRefresh';

const router: Router = express.Router();

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

router.get('/stats', async (_req, res) => {
  res.json(await requireSnapshot());
});

router.post('/stats', async (_req, res) => {
  res.json(await refreshOverviewSnapshot());
});

router.get('/top-sales-products', async (_req, res) => {
  const snapshot = await requireSnapshot();
  res.json({
    success: true,
    data: snapshot.top_sales_products,
    last_updated: snapshot.last_updated
  });
});

router.get('/monthly-inventory-change/:productModel', async (req, res) => {
  const snapshot = await requireSnapshot();
  const model = req.params['productModel'] as string;
  const data = Object.hasOwn(snapshot.monthly_inventory_changes, model)
    ? snapshot.monthly_inventory_changes[model]
    : undefined;
  res.json(
    data
      ? { success: true, data, last_updated: snapshot.last_updated }
      : {
          success: false,
          message:
            'Monthly inventory change data not found for this product, please refresh statistics first'
        }
  );
});

export default router;
