import { createApp } from '@/app';
import { config } from '@/utils/paths';
import { logger } from '@/utils/logger';

const app = createApp();

// Port Config
const PORT: number = config.server?.httpPort || 8000;

const shouldHostFrontend: boolean = !!(
  config.frontend?.hostByBackend &&
  (process.env['NODE_ENV'] === 'production' || process.env['FORCE_FRONTEND_HOSTING'] === 'true')
);

app.listen(PORT, () => {
  logger.info('Server Start Complete!', {
    port: PORT,
    environment: process.env['NODE_ENV'] || 'development',
    pid: process.pid,
    frontend_hosted: shouldHostFrontend
  });
});
