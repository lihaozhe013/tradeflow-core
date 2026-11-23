import { Hono } from 'hono';
import { logger } from '@/utils/logger';
import transactionPreview from './transactionPreview';
import * as ExportService from '@/routes/export/utils';
import type {
  BasicDataFilters,
  TransactionFilters,
  ReceivablePayableFilters,
  InvoiceFilters,
  AnalysisExportOptions
} from '@/routes/export/utils/types';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

app.route('/', transactionPreview);

// Export base information
app.post('/base-info', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { tables } = body as BasicDataFilters;
  const buffer = await ExportService.exportBaseInfo({
    tables: tables || '123'
  });
  const filename = ExportService.generateFilename('base-info');

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    }
  });
});

// Export inbound and outbound records
app.post('/inbound-outbound', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { tables, dateFrom, dateTo, productCode, customerCode } = body as TransactionFilters;
  const buffer = await ExportService.exportInboundOutbound({
    tables: tables || '12',
    dateFrom,
    dateTo,
    productCode,
    customerCode
  });

  const filename = ExportService.generateFilename('inbound-outbound');

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    }
  });
});

// Export statement
app.post('/statement', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { tables, dateFrom, dateTo, productCode, customerCode } = body as TransactionFilters;
  const buffer = await ExportService.exportStatement({
    tables: tables || '12',
    dateFrom,
    dateTo,
    productCode,
    customerCode
  });

  const filename = ExportService.generateFilename('statement');

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    }
  });
});

// Export receivable and payable details
app.post('/receivable-payable', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { outboundFrom, outboundTo, paymentFrom, paymentTo } = body as ReceivablePayableFilters;
  const buffer = await ExportService.exportReceivablePayable({
    outboundFrom,
    outboundTo,
    paymentFrom,
    paymentTo
  });

  const filename = ExportService.generateFilename('receivable-payable');
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    }
  });
});

// Export invoice details
app.post('/invoice', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { partnerCode, dateFrom, dateTo } = body as InvoiceFilters;
  if (!partnerCode) {
    return c.json({ success: false, message: 'Partner code is required' }, 400);
  }
  const buffer = await ExportService.exportInvoice({
    partnerCode,
    dateFrom,
    dateTo
  });
  const filename = ExportService.generateFilename('invoice');

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    }
  });
});

// Export analysis data
app.post('/analysis', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { analysisData, detailData, startDate, endDate, customerCode, productModel } =
    body as AnalysisExportOptions;

  if (!analysisData) {
    return c.json({ success: false, message: 'Analysis data is required' }, 400);
  }

  const buffer = await ExportService.exportAnalysis({
    analysisData,
    detailData: detailData || [],
    startDate,
    endDate,
    customerCode,
    productModel
  });
  const filename = ExportService.generateFilename('analysis');

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    }
  });
});

// Export advanced analysis data
app.post('/advanced-analysis', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { exportType, startDate, endDate } = body as {
    exportType: string;
    startDate: string;
    endDate: string;
  };

  logger.info(`[Export] Starting advanced analysis export`, {
    exportType,
    startDate,
    endDate
  });

  const buffer = await ExportService.exportAdvancedAnalysis({
    exportType,
    startDate,
    endDate
  });
  const filename = ExportService.generateFilename(`${exportType}-analysis`);

  logger.info(`[Export] Advanced analysis export successful`, {
    filename,
    size: buffer.length
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    }
  });
});

// Export inventory data
app.post('/inventory', async (_c) => {
  const buffer = await ExportService.exportInventory();
  const filename = ExportService.generateFilename('inventory');

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    }
  });
});

// Get export service status
app.get('/status', (c) => {
  return c.json({
    success: true,
    message: 'Export service is running (Based on Sheetjs)',
    available_exports: [
      {
        name: 'base-info',
        description: 'Base information export (partners, products, prices)'
      },
      {
        name: 'inbound-outbound',
        description: 'Transaction records export'
      },
      {
        name: 'receivable-payable',
        description: 'Financial records export'
      },
      {
        name: 'statement',
        description: 'Statement export'
      },
      {
        name: 'analysis',
        description: 'Analysis data export'
      },
      {
        name: 'advanced-analysis',
        description: 'Advanced analysis export (customer/product)'
      },
      {
        name: 'invoice',
        description: 'Invoice export'
      },
      {
        name: 'inventory',
        description: 'Current inventory data export'
      }
    ]
  });
});

export default app;
