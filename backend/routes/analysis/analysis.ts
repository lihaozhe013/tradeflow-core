import { Hono } from 'hono';
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
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

// GET /api/analysis/data
app.get('/data', async (c) => {
  const start_date = c.req.query('start_date');
  const end_date = c.req.query('end_date');
  const customer_code = c.req.query('customer_code');
  const supplier_code = c.req.query('supplier_code');
  const product_model = c.req.query('product_model');
  const type = c.req.query('type');

  const analysisType = (type as AnalysisType) || 'outbound';
  const partnerCode = analysisType === 'inbound' ? supplier_code : customer_code;

  const validation = validateBasicParams({ start_date, end_date });
  if (!validation.isValid) {
    return c.json(
      {
        success: false,
        message: validation.error
      },
      400
    );
  }

  const lastUpdated = new Date().toISOString();

  if (analysisType === 'inbound') {
    const purchaseData = await calculatePurchaseData(
      start_date!,
      end_date!,
      partnerCode,
      product_model
    );

    return c.json({
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

  return c.json({
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
app.get('/detail', async (c) => {
  const start_date = c.req.query('start_date');
  const end_date = c.req.query('end_date');
  const customer_code = c.req.query('customer_code');
  const supplier_code = c.req.query('supplier_code');
  const product_model = c.req.query('product_model');
  const type = c.req.query('type');

  const analysisType = (type as AnalysisType) || 'outbound';
  const partnerCode = analysisType === 'inbound' ? supplier_code : customer_code;

  const validation = validateBasicParams({ start_date, end_date });
  if (!validation.isValid) {
    return c.json(
      {
        success: false,
        message: validation.error
      },
      400
    );
  }

  const detailData = await calculateDetailAnalysis(
    start_date!,
    end_date!,
    partnerCode,
    product_model,
    analysisType
  );

  return c.json({
    success: true,
    data: detailData || []
  });
});

// GET /api/analysis/filter-options
app.get('/filter-options', async (c) => {
  const options = await getFilterOptions();
  return c.json({
    success: true,
    ...options
  });
});

export default app;
