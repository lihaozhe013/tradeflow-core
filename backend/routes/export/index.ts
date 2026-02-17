import { Router, Request, Response } from 'express';
import ExcelExporter from '@/routes/export/utils/excelExporter';

const router = Router();

// Export base information
router.post('/base-info', async (req: Request, res: Response) => {
  try {
    const { tables } = req.body as { tables?: string };

    const exporter = new ExcelExporter();
    const buffer = await exporter.exportBaseInfo({ tables: tables || '123' });

    const filename = exporter.generateFilename('base-info');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Base info export failed:', error);
    res.status(500).json({ success: false, message: `Export failed: ${error.message}` });
  }
});

// Export inbound and outbound records
router.post('/inbound-outbound', async (req: Request, res: Response) => {
  try {
    const { tables, dateFrom, dateTo, productCode, customerCode } = req.body as any;

    const exporter = new ExcelExporter();
    const buffer = await exporter.exportInboundOutbound({
      tables: tables || '12',
      dateFrom,
      dateTo,
      productCode,
      customerCode,
    });

    const filename = exporter.generateFilename('inbound-outbound');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Inbound/outbound export failed:', error);
    res.status(500).json({ success: false, message: `Export failed: ${error.message}` });
  }
});

// Export statement
router.post('/statement', async (req: Request, res: Response) => {
  try {
    const { tables, dateFrom, dateTo, productCode, customerCode } = req.body as any;

    const exporter = new ExcelExporter();
    const buffer = await exporter.exportStatement({
      tables: tables || '12',
      dateFrom,
      dateTo,
      productCode,
      customerCode,
    });

    const filename = exporter.generateFilename('statement');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Statement export failed:', error);
    res.status(500).json({ success: false, message: `Export failed: ${error.message}` });
  }
});

// Export receivable and payable details
router.post('/receivable-payable', async (req: Request, res: Response) => {
  try {
    const { outboundFrom, outboundTo, paymentFrom, paymentTo } = req.body as any;

    const exporter = new ExcelExporter();
    const buffer = await exporter.exportReceivablePayable({
      outboundFrom,
      outboundTo,
      paymentFrom,
      paymentTo,
    });

    const filename = exporter.generateFilename('receivable-payable');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Receivable/payable export failed:', error);
    res.status(500).json({ success: false, message: `Export failed: ${error.message}` });
  }
});

// Export invoice details
router.post('/invoice', async (req: Request, res: Response) => {
  try {
    const { partnerCode, dateFrom, dateTo } = req.body as any;

    if (!partnerCode) {
      res.status(400).json({ success: false, message: 'Partner code is required' });
      return;
    }

    const exporter = new ExcelExporter();
    const buffer = await exporter.exportInvoice({
      partnerCode,
      dateFrom,
      dateTo,
    });

    const filename = exporter.generateFilename('invoice');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Invoice export failed:', error);
    res.status(500).json({ success: false, message: `Export failed: ${error.message}` });
  }
});

// Export analysis data
router.post('/analysis', async (req: Request, res: Response) => {
  try {
    const { analysisData, detailData, startDate, endDate, customerCode, productModel } =
      req.body as any;

    if (!analysisData) {
      res.status(400).json({ success: false, message: 'Analysis data is required' });
      return;
    }

    const exporter = new ExcelExporter();
    const buffer = await exporter.exportAnalysis({
      analysisData,
      detailData: detailData || [],
      startDate,
      endDate,
      customerCode,
      productModel,
    });

    const filename = exporter.generateFilename('analysis');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Analysis export failed:', error);
    res.status(500).json({ success: false, message: `Export failed: ${error.message}` });
  }
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
        endpoint: '/api/export/base-info',
        method: 'POST',
        response_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      {
        name: 'inbound-outbound',
        description: 'Inbound and outbound records export',
        endpoint: '/api/export/inbound-outbound',
        method: 'POST',
        response_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      {
        name: 'statement',
        description: 'Statement export (custom format for inbound/outbound)',
        endpoint: '/api/export/statement',
        method: 'POST',
        response_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      {
        name: 'receivable-payable',
        description: 'Receivable and payable details export',
        endpoint: '/api/export/receivable-payable',
        method: 'POST',
        response_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      {
        name: 'invoice',
        description: 'Invoice export (aggregated by product)',
        endpoint: '/api/export/invoice',
        method: 'POST',
        required_params: ['partnerCode', 'dateFrom', 'dateTo'],
        response_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      {
        name: 'analysis',
        description: 'Data analysis export (summary and details)',
        endpoint: '/api/export/analysis',
        method: 'POST',
        required_params: ['analysisData'],
        response_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  });
});

// Advanced analysis export
router.post('/analysis/advanced', async (req: Request, res: Response) => {
  try {
    const { exportType, startDate, endDate } = req.body as {
      exportType?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!exportType || !['customer', 'product'].includes(exportType)) {
      res.status(400).json({
        success: false,
        message: 'Export type must be customer or product',
      });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
      return;
    }

    const exporter = new ExcelExporter();
    const buffer = await exporter.exportAdvancedAnalysis({
      exportType,
      startDate,
      endDate,
    });

    const typeText = exportType === 'customer' ? 'Customer-Analysis' : 'Product-Analysis';
    const dateText = `${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}`;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:-]/g, '');
    const filename = `Advanced-Analysis-${typeText}-${dateText}-${timestamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Advanced analysis export failed:', error);
    res.status(500).json({ success: false, message: `Export failed: ${error.message}` });
  }
});

export default router;
