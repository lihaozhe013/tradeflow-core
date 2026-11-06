import { Hono } from 'hono';
import { cors } from 'hono/cors';
import fs from 'fs';
import path from 'path';
import type { AppEnv } from '@/types/hono';
import { config, getConfigDir, getCacheDir } from '@/utils/paths';
import { logger } from '@/utils/logger';
import { requestLogger, errorLogger } from '@/utils/loggerMiddleware';
import { authenticateToken, authorize, checkWritePermission } from '@/utils/auth';
import { SnapshotError } from '@/services/snapshotRefresh';
import overviewRoutes from '@/routes/overview';
import inboundRoutes from '@/routes/inbound';
import outboundRoutes from '@/routes/outbound';
import inventoryRoutes from '@/routes/inventory';
import partnersRoutes from '@/routes/partners';
import productsRoutes from '@/routes/products';
import productPricesRoutes from '@/routes/productPrices';
import receivableRoutes from '@/routes/receivable';
import payableRoutes from '@/routes/payable';
import exportRoutes from '@/routes/export/index';
import analysisRoutes from '@/routes/analysis/analysis';
import settingsRoutes from '@/routes/settings';
import aboutRoutes from '@/routes/about';
import authRoutes from '@/routes/auth';
import usersRoutes from '@/routes/users';
import auditRoutes from '@/routes/audit';
import { createMcpRouter, getMcpSettings } from '@/mcp/server';
import type { McpConfig } from '@/types/config';
import { createMcpConnectionRouter } from '@/mcp/connections';
import transactionDraftRoutes from '@/routes/transactionDrafts';

export function createApp(mcpSettings: McpConfig = getMcpSettings()): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  logger.info(`Config directory is set to: ${getConfigDir()}`);
  logger.info(`Cache directory is set to: ${getCacheDir()}`);

  const PORT: number = config.server?.httpPort || 8000;

  // Logger Middleware
  app.use('*', requestLogger);

  // CORS Config (Only for Dev Mode)
  if (process.env['NODE_ENV'] !== 'production') {
    app.use(
      '*',
      cors({
        origin: ['http://localhost:5173', `http://localhost:${PORT}`],
        credentials: true
      })
    );
    logger.info('Dev Mode: CORS cross-origin support has been enabled.');
  }

  // =============================================================================
  // API Route Registration
  // =============================================================================

  app.get('/healthz', (c) => {
    return c.body(null, 204);
  });

  app.route('/api/auth', authRoutes);
  app.route('/api/mcp', createMcpConnectionRouter(mcpSettings));

  if (mcpSettings.enabled) {
    app.route('/mcp', createMcpRouter(mcpSettings));
  } else {
    app.all('/mcp', (c) => c.json({ error: 'Not found' }, 404));
    app.all('/mcp/*', (c) => c.json({ error: 'Not found' }, 404));
  }

  // Auth & Write permission check on all other /api/* routes
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/auth/')) {
      return await next();
    }
    return authenticateToken(c, next);
  });

  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/auth/')) {
      return await next();
    }
    return checkWritePermission(c, next);
  });

  const editorPageAccess = authorize(['editor', 'superuser']);

  app.use('/api/overview/*', editorPageAccess);
  app.route('/api/overview', overviewRoutes);

  app.route('/api/inbound', inboundRoutes);
  app.route('/api/outbound', outboundRoutes);
  app.route('/api/transaction-drafts', transactionDraftRoutes);
  app.route('/api/inventory', inventoryRoutes);
  app.route('/api/partners', partnersRoutes);
  app.route('/api/products', productsRoutes);
  app.route('/api/product-prices', productPricesRoutes);

  app.use('/api/receivable/*', editorPageAccess);
  app.route('/api/receivable', receivableRoutes);

  app.use('/api/payable/*', editorPageAccess);
  app.route('/api/payable', payableRoutes);

  app.use('/api/export/*', editorPageAccess);
  app.route('/api/export', exportRoutes);

  app.use('/api/analysis/*', editorPageAccess);
  app.route('/api/analysis', analysisRoutes);

  app.route('/api/settings', settingsRoutes);

  app.use('/api/about/*', authorize(['superuser']));
  app.route('/api/about', aboutRoutes);

  app.route('/api/users', usersRoutes);
  app.route('/api/audit', auditRoutes);

  // =============================================================================
  // Error Message Middleware
  // =============================================================================

  app.onError((err, c) => {
    if (err instanceof SnapshotError) {
      return c.json(
        { success: false, code: err.code, error: err.message, message: err.message },
        err.status as any
      );
    }

    errorLogger(err, c.req.path, c.req.method, c.get('user')?.username);

    logger.error('Unhandled Error', {
      error: err.message,
      stack: err.stack,
      url: c.req.url,
      method: c.req.method
    });

    return c.json(
      {
        success: false,
        message: process.env['NODE_ENV'] === 'production' ? 'Internal Server Error' : err.message
      },
      500
    );
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
      app.get('*', async (c, next) => {
        if (
          c.req.path.startsWith('/api') ||
          c.req.path === '/mcp' ||
          c.req.path.startsWith('/mcp/') ||
          c.req.path === '/healthz'
        ) {
          return await next();
        }

        const reqPath = c.req.path === '/' ? '/index.html' : c.req.path;
        const filePath = path.join(frontendDist, reqPath);
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file);
        }

        // SPA Route Fallback
        if (config.frontend?.fallbackToIndex) {
          const indexFile = Bun.file(path.join(frontendDist, 'index.html'));
          if (await indexFile.exists()) {
            return new Response(indexFile);
          }
        }

        return await next();
      });

      logger.info('Frontend file hosting has been enabled!');
    } else {
      logger.warn(`The frontend build directory does not exist!`);
    }
  } else {
    logger.info('Frontend hosting has been disabled. Use a standalone frontend CDN server!');
  }

  return app;
}

const defaultApp = createApp();
export type AppType = typeof defaultApp;
export default defaultApp;
