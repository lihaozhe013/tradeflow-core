import express, { Express, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import type { CustomError } from '@/types/index';
import { config } from '@/utils/paths';
import { logger } from '@/utils/logger';
import { requestLogger, errorLogger } from '@/utils/loggerMiddleware';
import { authenticateToken, checkWritePermission } from '@/utils/auth';
import overviewRoutes from '@/routes/overview';
import inboundRoutes from '@/routes/inbound';
import outboundRoutes from '@/routes/outbound';
import inventoryRoutes from '@/routes/inventory';
import partnersRoutes from '@/routes/partners';
import productsRoutes from '@/routes/products';
import productPricesRoutes from '@/routes/productPrices';
import receivableRoutes from '@/routes/receivable';
import payableRoutes from '@/routes/payable';
import exportRoutes from '@/routes/export';
import analysisRoutes from '@/routes/analysis/analysis';
import aboutRoutes from '@/routes/about';
import authRoutes from '@/routes/auth';

const app: Express = express();

// Port Config
const PORT: number = config.server?.httpPort || 8000;

// Logger Middleware
app.use(requestLogger);

// JSON Middleware
app.use(express.json());

// CORS Config (Only for Dev Mode)
if (process.env['NODE_ENV'] !== 'production') {
  app.use(
    cors({
      origin: ['http://localhost:5173', `http://localhost:${PORT}`],
      credentials: true,
    }),
  );
  console.log('Dev Mode: CORS cross-origin support has been enabled.');
}

// =============================================================================
// API Route Registration
// =============================================================================

app.use('/api/auth', authRoutes);

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) {
    return next();
  }
  return authenticateToken(req, res, next);
});

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) {
    return next();
  }
  return checkWritePermission(req, res, next);
});

app.use('/api/overview', overviewRoutes);
app.use('/api/inbound', inboundRoutes);
app.use('/api/outbound', outboundRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/partners', partnersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/product-prices', productPricesRoutes);
app.use('/api/receivable', receivableRoutes);
app.use('/api/payable', payableRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/about', aboutRoutes);

// =============================================================================
// Error Message Middleware
// =============================================================================

app.use(errorLogger);

app.use((err: CustomError, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled Error', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    message: process.env['NODE_ENV'] === 'production' ? 'Internal Server Error' : err.message,
  });
});

// =============================================================================
// Frontend Static File Hosting (Based on Config File)
// =============================================================================

const shouldHostFrontend: boolean = !!(
  config.frontend?.hostByBackend &&
  (process.env['NODE_ENV'] === 'production' || process.env['FORCE_FRONTEND_HOSTING'] === 'true')
);

if (shouldHostFrontend && config.frontend) {
  const frontendDist: string = config.frontend.distPath || './frontend/';
  logger.info(`Frontend hosting has been enabled: ${frontendDist}`);

  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));

    // SPA Route Fallback
    if (config.frontend.fallbackToIndex) {
      app.get(/^\/(?!api).*/, (_req: Request, res: Response) => {
        res.sendFile(path.join(frontendDist, 'index.html'));
      });
    }

    logger.info('Frontend file hosting has been enabled!');
  } else {
    logger.warn(`The frontend build directory does not exist!`);
  }
} else {
  logger.info('Frontend hosting has been disabled. Use a standalone frontend CDN server!');
}

// =============================================================================
// Start Server
// =============================================================================

app.listen(PORT, () => {
  console.log('Server Start Complete!');

  logger.info('Server Start Complete!', {
    port: PORT,
    environment: process.env['NODE_ENV'] || 'development',
    pid: process.pid,
    frontend_hosted: shouldHostFrontend,
  });
});
