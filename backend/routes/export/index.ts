import { Router, Request, Response, type Router as ExpressRouter } from 'express';
import { logger } from '@/utils/logger';
import * as ExportService from '@/routes/export/utils';
import {
  BasicDataFilters,
  TransactionFilters,
  ReceivablePayableFilters,
  InvoiceFilters,
  AnalysisExportOptions,
} from '@/routes/export/utils/types';

const router: ExpressRouter = Router();

// Export base information
router.post('/base-info', async (req: Request, res: Response) => {
  const { tables } = req.body as BasicDataFilters;
  const buffer = await ExportService.exportBaseInfo({ tables: tables || '123' });
  const filename = ExportService.generateFilename('base-info');

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

// Export inbound and outbound records
router.post('/inbound-outbound', async (req: Request, res: Response) => {
  const { tables, dateFrom, dateTo, productCode, customerCode } = req.body as TransactionFilters;
  const buffer = await ExportService.exportInboundOutbound({
    tables: tables || '12',
    dateFrom,
    dateTo,
    productCode,
    customerCode,
  });

  const filename = ExportService.generateFilename('inbound-outbound');

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

// Export statement
router.post('/statement', async (req: Request, res: Response) => {
  const { tables, dateFrom, dateTo, productCode, customerCode } = req.body as TransactionFilters;
  const buffer = await ExportService.exportStatement({
    tables: tables || '12',
    dateFrom,
    dateTo,
    productCode,
    customerCode,
  });

  const filename = ExportService.generateFilename('statement');

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

// Export receivable and payable details
router.post('/receivable-payable', async (req: Request, res: Response) => {
  const { outboundFrom, outboundTo, paymentFrom, paymentTo } = req.body as ReceivablePayableFilters;
  const buffer = await ExportService.exportReceivablePayable({
    outboundFrom,
    outboundTo,
    paymentFrom,
    paymentTo,
  });

  const filename = ExportService.generateFilename('receivable-payable');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

// Export invoice details
router.post('/invoice', async (req: Request, res: Response) => {
  const { partnerCode, dateFrom, dateTo } = req.body as InvoiceFilters;
  if (!partnerCode) {
    res.status(400).json({ success: false, message: 'Partner code is required' });
    return;
  }
  const buffer = await ExportService.exportInvoice({
    partnerCode,
    dateFrom,
    dateTo,
  });
  const filename = ExportService.generateFilename('invoice');

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

// Export analysis data
router.post('/analysis', async (req: Request, res: Response) => {
  const { analysisData, detailData, startDate, endDate, customerCode, productModel } =
    req.body as AnalysisExportOptions;

  if (!analysisData) {
    res.status(400).json({ success: false, message: 'Analysis data is required' });
    return;
  }

  const buffer = await ExportService.exportAnalysis({
    analysisData,
    detailData: detailData || [],
    startDate,
    endDate,
    customerCode,
    productModel,
  });
  const filename = ExportService.generateFilename('analysis');

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

// Export advanced analysis data
router.post('/advanced-analysis', async (req: Request, res: Response) => {
  const { exportType, startDate, endDate } = req.body as {
    exportType: string;
    startDate: string;
    endDate: string;
  };

  logger.info(`[Export] Starting advanced analysis export`, { exportType, startDate, endDate });

  const buffer = await ExportService.exportAdvancedAnalysis({
    exportType,
    startDate,
    endDate,
  });
  const filename = ExportService.generateFilename(`${exportType}-analysis`);

  logger.info(`[Export] Advanced analysis export successful`, { filename, size: buffer.length });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

// Export inventory data
router.post('/inventory', async (_req: Request, res: Response) => {
  const buffer = await ExportService.exportInventory();
  const filename = ExportService.generateFilename('inventory');

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

// Get export service status
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Export service is running (Based on Sheetjs)',
    available_exports: [
      {
        name: 'base-info',
        description: 'Base information export (partners, products, prices)',
      },
      {
        name: 'inbound-outbound',
        description: 'Transaction records export',
      },
      {
        name: 'receivable-payable',
        description: 'Financial records export',
      },
      {
        name: 'statement',
        description: 'Statement export',
      },
      {
        name: 'analysis',
        description: 'Analysis data export',
      },
      {
        name: 'advanced-analysis',
        description: 'Advanced analysis export (customer/product)',
      },
      {
        name: 'invoice',
        description: 'Invoice export',
      },
      {
        name: 'inventory',
        description: 'Current inventory data export',
      },
    ],
  });
});

export default router;
