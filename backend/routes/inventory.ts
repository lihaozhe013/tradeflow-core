import express, { type Router, type Request, type Response } from 'express';
import { 
  getInventorySummary, 
  refreshInventoryCache, 
  getInventoryCache 
} from '@/utils/inventoryCacheService.js';

const router: Router = express.Router();

/**
 * GET /api/inventory
 */
router.get('/', (req: Request, res: Response): void => {
  const { product_model, page = 1, limit = 10 } = req.query;
  
  getInventorySummary(
    product_model as string | null, 
    Number(page), 
    Number(limit), 
    (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json(result);
    }
  );
});

/**
 * GET /api/inventory/total-cost-estimate
 */
router.get('/total-cost-estimate', (_req: Request, res: Response): void => {
  // getInventoryCache reads from JSON file, so it is safe regardless of DB driver
  getInventoryCache((err, inventoryData) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    res.json({ 
      total_cost_estimate: inventoryData!.total_cost_estimate || 0,
      last_updated: inventoryData!.last_updated 
    });
  });
});

/**
 * POST /api/inventory/refresh
 */
router.post('/refresh', (_req: Request, res: Response): void => {
  // This triggers a refresh which queries DB.
  refreshInventoryCache((err, inventoryData) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    res.json({ 
      success: true, 
      message: 'Inventory cache refresh completed!',
      last_updated: inventoryData!.last_updated,
      products_count: Object.keys(inventoryData!.products).length
    });
  });
});

export default router;
