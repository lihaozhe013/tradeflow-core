import { config } from '@/utils/paths';
import { logger } from '@/utils/logger';
import { initializeDatabase, DatabaseBootstrapError } from '@/utils/databaseBootstrap';

// Port Config
const PORT: number = config.server?.httpPort || 8000;

const shouldHostFrontend: boolean = !!(
  config.frontend?.hostByBackend &&
  (process.env['NODE_ENV'] === 'production' || process.env['FORCE_FRONTEND_HOSTING'] === 'true')
);

async function startServer(): Promise<void> {
  let disconnectClients: (() => Promise<void>) | undefined;
  try {
    await initializeDatabase(config.database);
    const [{ createApp }, { prisma, mcpPrisma }] = await Promise.all([
      import('@/app'),
      import('@/prismaClient')
    ]);
    disconnectClients = async () => {
      await Promise.all([prisma.$disconnect(), mcpPrisma.$disconnect()]);
    };
    try {
      await Promise.all([prisma.$connect(), mcpPrisma.$connect()]);
    } catch {
      throw new DatabaseBootstrapError(
        'The Prisma database clients could not connect after schema initialization.',
        'PRISMA_CONNECT_FAILED',
        'Check PostgreSQL availability and the configured role permissions.'
      );
    }

    const { initializeSettings } = await import('@/settings/service');
    await initializeSettings();
    const app = createApp();

    const server = Bun.serve({
      fetch: app.fetch,
      port: PORT
    });

    if (process.env['NODE_ENV'] !== 'test') {
      void import('@/services/dashboardScheduler').then(({ startDashboardScheduler }) => {
        const stop = startDashboardScheduler();
        const shutdown = async () => {
          stop();
          server.stop(true);
          await disconnectClients?.();
          process.exit(0);
        };
        process.once('SIGTERM', () => void shutdown());
        process.once('SIGINT', () => void shutdown());
      });
    }

    logger.info('Server Start Complete!', {
      port: PORT,
      environment: process.env['NODE_ENV'] || 'development',
      pid: process.pid,
      frontend_hosted: shouldHostFrontend
    });
  } catch (error) {
    if (error instanceof DatabaseBootstrapError) {
      logger.error('Backend startup failed.', {
        errorCode: error.errorCode,
        error: error.message,
        recommendation: error.recommendation
      });
    } else {
      logger.error('Backend startup failed.', { errorCode: 'STARTUP_FAILED' });
    }
    await disconnectClients?.();
    process.exitCode = 1;
  }
}

void startServer();
