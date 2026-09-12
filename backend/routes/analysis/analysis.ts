import { Router, Request, Response, type Router as ExpressRouter } from 'express';
import decimalCalc from '@/utils/decimalCalculator';
import {
  calculateFilteredSoldGoodsCost,
  calculateDetailAnalysis,
  calculateSalesData,
  calculatePurchaseData,
  getFilterOptions,
  validateBasicParams
} from '@/routes/analysis/utils';
import type { AnalysisType } from '@/routes/analysis/utils/types';

const router: ExpressRouter = Router();

// GET /api/analysis/data
router.get('/data', async (req: Request, res: Response) => {
  const { start_date, end_date, customer_code, supplier_code, product_model, type } =
    req.query as Record<string, string | undefined>;

  const analysisType = (type as AnalysisType) || 'outbound';
  const partnerCode = analysisType === 'inbound' ? supplier_code : customer_code;

  const validation = validateBasicParams({ start_date, end_date });
  if (!validation.isValid) {
    res.status(400).json({
      success: false,
      message: validation.error
    });
    return;
  }

  const lastUpdated = new Date().toISOString();

  if (analysisType === 'inbound') {
    const purchaseData = await calculatePurchaseData(
      start_date!,
      end_date!,
      partnerCode,
      product_model
    );

    res.json({
      success: true,
      data: {
        ...purchaseData,
        query_params: {
          start_date,
          end_date,
          supplier_code: partnerCode || 'All',
          product_model: product_model || 'All',
          type: 'inbound'
        },
        last_updated: lastUpdated
      }
    });
    return;
  }

  const salesData = await calculateSalesData(start_date!, end_date!, customer_code, product_model);

  const costAmount = await calculateFilteredSoldGoodsCost(
    start_date!,
    end_date!,
    customer_code,
    product_model
  );

  const salesAmount = salesData.sales_amount;
  const cost = decimalCalc.toDbNumber(costAmount ?? 0, 2);
  const profit = decimalCalc.toDbNumber(decimalCalc.subtract(salesAmount, cost), 2);

  let profitRate = 0;
  if (salesAmount > 0) {
    const rate = decimalCalc.multiply(decimalCalc.divide(profit, salesAmount), 100);
    profitRate = decimalCalc.toDbNumber(rate, 2);
  }

  res.json({
    success: true,
    data: {
      sales_amount: salesAmount,
      cost_amount: cost,
      profit_amount: profit,
      profit_rate: profitRate,
      query_params: {
        start_date,
        end_date,
        customer_code: customer_code || 'All',
        product_model: product_model || 'All'
      },
      last_updated: lastUpdated
    }
  });
});

// GET /api/analysis/detail
router.get('/detail', async (req: Request, res: Response) => {
  const { start_date, end_date, customer_code, supplier_code, product_model, type } =
    req.query as Record<string, string | undefined>;

  const analysisType = (type as AnalysisType) || 'outbound';
  const partnerCode = analysisType === 'inbound' ? supplier_code : customer_code;

  const validation = validateBasicParams({ start_date, end_date });
  if (!validation.isValid) {
    res.status(400).json({
      success: false,
      message: validation.error
    });
    return;
  }

  const detailData = await calculateDetailAnalysis(
    start_date!,
    end_date!,
    partnerCode,
    product_model,
    analysisType
  );

  res.json({
    success: true,
    data: detailData || []
  });
});

// GET /api/analysis/filter-options
router.get('/filter-options', async (_req: Request, res: Response) => {
  const options = await getFilterOptions();
  res.json({
    success: true,
    ...options
  });
});

export default router;
