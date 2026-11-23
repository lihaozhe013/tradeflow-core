import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getMimeType } from 'hono/utils/mime';
import fs from 'fs';
import fsPromises from 'node:fs/promises';
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
      const resolvedDist = path.resolve(frontendDist);

      const serveStaticFile = async (
        filePath: string,
        ifNoneMatch: string | undefined
      ): Promise<Response | null> => {
        let stats: fs.Stats;
        try {
          stats = await fsPromises.stat(filePath);
        } catch {
          return null;
        }
        if (!stats.isFile()) return null;

        const etag = `W/"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`;
        const headers: Record<string, string> = {
          'Content-Type': getMimeType(filePath) ?? 'application/octet-stream',
          'Cache-Control': 'public, max-age=0',
          ETag: etag,
          'Last-Modified': stats.mtime.toUTCString()
        };

        if (ifNoneMatch && ifNoneMatch === etag) {
          return new Response(null, { status: 304, headers });
        }

        const content = await fsPromises.readFile(filePath);
        return new Response(content, { status: 200, headers });
      };

      app.get('*', async (c, next) => {
        if (
          c.req.path.startsWith('/api') ||
          c.req.path === '/mcp' ||
          c.req.path.startsWith('/mcp/') ||
          c.req.path === '/healthz'
        ) {
          return await next();
        }

        let decodedPath: string;
        try {
          decodedPath = decodeURIComponent(c.req.path);
        } catch {
          return c.body(null, 400);
        }
        if (decodedPath.includes('\0')) {
          return c.body(null, 400);
        }

        const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
        const segments = relativePath.split('/').filter(Boolean);
        // Block dotfiles and any segment attempting upward traversal before resolving.
        if (!segments.some((segment) => segment.startsWith('.'))) {
          const candidatePath = path.resolve(resolvedDist, relativePath);
          if (candidatePath.startsWith(resolvedDist + path.sep)) {
            const response = await serveStaticFile(candidatePath, c.req.header('if-none-match'));
            if (response) return response;
          }
        }

        // SPA Route Fallback
        if (config.frontend?.fallbackToIndex) {
          const indexResponse = await serveStaticFile(
            path.join(resolvedDist, 'index.html'),
            c.req.header('if-none-match')
          );
          if (indexResponse) return indexResponse;
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

export type AppType = ReturnType<typeof createApp>;
