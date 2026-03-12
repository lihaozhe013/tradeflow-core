import { Router, Request, Response } from 'express';
import decimalCalc from '@/utils/decimalCalculator';
import {
  calculateFilteredSoldGoodsCost,
  calculateDetailAnalysis,
  calculateSalesData,
  calculatePurchaseData,
  getFilterOptions,
  validateAnalysisParams,
  validateBasicParams,
  generateCacheKey,
  generateDetailCacheKey,
  readCache,
  writeCache,
} from '@/routes/analysis/utils';
import type {
  SalesData,
  DetailItem,
  FilterOptions,
  AnalysisType,
} from '@/routes/analysis/utils/types';

const router = Router();

// GET /api/analysis/data
router.get('/data', (req: Request, res: Response) => {
  const { start_date, end_date, customer_code, supplier_code, product_model, type } =
    req.query as Record<string, string | undefined>;

  const analysisType = (type as AnalysisType) || 'outbound';
  const partnerCode = analysisType === 'inbound' ? supplier_code : customer_code;

  const validation = validateBasicParams({ start_date, end_date });
  if (!validation.isValid) {
    res.status(400).json({
      success: false,
      message: validation.error,
    });
    return;
  }

  const cacheKey = generateCacheKey(
    start_date!,
    end_date!,
    partnerCode,
    product_model,
    analysisType,
  );
  const cache = readCache();

  if (cache[cacheKey]) {
    res.json({
      success: true,
      data: cache[cacheKey],
    });
    return;
  }

  res.status(503).json({
    success: false,
    error:
      'Analysis data has not been generated. Please click the refresh button to calculate the data.',
  });
  return;
});

// GET /api/analysis/detail
router.get('/detail', (req: Request, res: Response) => {
  const { start_date, end_date, customer_code, supplier_code, product_model, type } =
    req.query as Record<string, string | undefined>;

  const analysisType = (type as AnalysisType) || 'outbound';
  const partnerCode = analysisType === 'inbound' ? supplier_code : customer_code;

  const validation = validateBasicParams({ start_date, end_date });
  if (!validation.isValid) {
    res.status(400).json({
      success: false,
      message: validation.error,
    });
    return;
  }

  const detailCacheKey = generateDetailCacheKey(
    start_date!,
    end_date!,
    partnerCode,
    product_model,
    analysisType,
  );
  const cache = readCache();

  if (cache[detailCacheKey]) {
    res.json({
      success: true,
      data: cache[detailCacheKey],
    });
    return;
  }

  res.json({
    success: true,
    data: [],
  });
  return;
});

// POST /api/analysis/refresh
router.post('/refresh', (req: Request, res: Response) => {
  const { start_date, end_date, customer_code, supplier_code, product_model, type } =
    req.body as Record<string, string | undefined>;

  const analysisType = (type as AnalysisType) || 'outbound';
  const partnerCode = analysisType === 'inbound' ? supplier_code : customer_code;

  const validation = validateAnalysisParams({
    start_date,
    end_date,
    customer_code: partnerCode, // validating generic partner code
    product_model,
  });

  if (!validation.isValid) {
    res.status(400).json({
      success: false,
      message: validation.error,
    });
    return;
  }

  // Helper to save result and respond
  const saveAndRespond = (data: any, detailData: DetailItem[]) => {
    const cacheKey = generateCacheKey(
      start_date!,
      end_date!,
      partnerCode,
      product_model,
      analysisType,
    );
    const detailCacheKey = generateDetailCacheKey(
      start_date!,
      end_date!,
      partnerCode,
      product_model,
      analysisType,
    );
    const cache = readCache();

    cache[cacheKey] = data as unknown as Record<string, unknown>;
    cache[detailCacheKey] = {
      detail_data: detailData,
      last_updated: new Date().toISOString(),
    } as unknown as Record<string, unknown>;

    if (writeCache(cache)) {
      res.json({
        success: true,
        data: data,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Cache save failed',
      });
    }
  };

  if (analysisType === 'inbound') {
    calculatePurchaseData(
      start_date!,
      end_date!,
      partnerCode, // This is supplier_code
      product_model,
      (err, purchaseData) => {
        if (err || !purchaseData) {
          res.status(500).json({
            success: false,
            message: 'Failed to calculate purchase data',
          });
          return;
        }

        const resultData = {
          ...purchaseData,
          query_params: {
            start_date,
            end_date,
            supplier_code: partnerCode || 'All',
            product_model: product_model || 'All',
            type: 'inbound',
          },
          last_updated: new Date().toISOString(),
        };

        calculateDetailAnalysis(
          start_date!,
          end_date!,
          partnerCode,
          product_model,
          'inbound',
          (detailErr, detailData) => {
            if (detailErr) {
              console.error('Detail analysis failed', detailErr);
            }
            saveAndRespond(resultData, detailData || []);
          },
        );
      },
    );
    return;
  }

  // Outbound Logic
  calculateSalesData(
    start_date!,
    end_date!,
    customer_code,
    product_model,
    (salesErr: Error | null, salesData?: SalesData) => {
      if (salesErr || !salesData) {
        console.error('Failed to calculate sales:', salesErr);
        res.status(500).json({
          success: false,
          message: 'Failed to calculate sales',
        });
        return;
      }

      calculateFilteredSoldGoodsCost(start_date!, end_date!, customer_code, product_model).then(
        (costAmount) => {
          const salesAmount = salesData.sales_amount;
          const cost = decimalCalc.toDbNumber(costAmount ?? 0, 2);
          const profit = decimalCalc.toDbNumber(decimalCalc.subtract(salesAmount, cost), 2);

          let profitRate = 0;
          if (salesAmount > 0) {
            const rate = decimalCalc.multiply(decimalCalc.divide(profit, salesAmount), 100);
            profitRate = decimalCalc.toDbNumber(rate, 2);
          }

          const resultData = {
            sales_amount: salesAmount,
            cost_amount: cost,
            profit_amount: profit,
            profit_rate: profitRate,
            query_params: {
              start_date,
              end_date,
              customer_code: customer_code || 'All',
              product_model: product_model || 'All',
            },
            last_updated: new Date().toISOString(),
          };

          calculateDetailAnalysis(
            start_date!,
            end_date!,
            customer_code,
            product_model,
            'outbound',
            (detailErr: Error | null, detailData?: DetailItem[]) => {
              if (detailErr) {
                console.error('Failed to compute detailed analysis data:', detailErr);
                detailData = [];
              }

              saveAndRespond(resultData, detailData || []);
            },
          );
        },
      );
    },
  );
});

// GET /api/analysis/filter-options
router.get('/filter-options', (_req: Request, res: Response) => {
  getFilterOptions((err: Error | null, options?: FilterOptions) => {
    if (err || !options) {
      res.status(500).json({
        success: false,
        message: 'Query filtering options failed',
      });
      return;
    }

    res.json({
      success: true,
      ...options,
    });
  });
});

// POST /api/analysis/clean-cache
router.post('/clean-cache', (_req: Request, res: Response) => {
  try {
    const cache = readCache();
    const originalSize = Object.keys(cache).length;

    if (writeCache(cache)) {
      const newCache = readCache();
      const newSize = Object.keys(newCache).length;
      const cleanedCount = originalSize - newSize;

      res.json({
        success: true,
        message: `Cleaning completed. ${cleanedCount} expired cache entries deleted.`,
        original_size: originalSize,
        new_size: newSize,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Cache clearing failed',
      });
    }
  } catch (error) {
    console.error('Cache clearing failed:', error);
    res.status(500).json({
      success: false,
      message: 'Cache clearing failed',
    });
  }
});

export default router;
