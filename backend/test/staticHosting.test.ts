import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import request from '@/test/helpers/request';
import { config } from '@/utils/paths';

let tmpDir = '';
let distDir = '';
const originalFrontend = config.frontend ? { ...config.frontend } : undefined;
const originalForce = process.env['FORCE_FRONTEND_HOSTING'];

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tradeflow-static-'));
  distDir = path.join(tmpDir, 'dist');
  await fs.mkdir(path.join(distDir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'secret.txt'), 'TOP_SECRET');
  await fs.writeFile(path.join(distDir, '.env'), 'SECRET_ENV=1');
  await fs.writeFile(path.join(distDir, 'index.html'), '<html><body>SPA</body></html>');
  await fs.writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log("ok");');

  config.frontend = {
    hostByBackend: true,
    distPath: distDir,
    fallbackToIndex: true
  };
  process.env['FORCE_FRONTEND_HOSTING'] = 'true';
});

afterAll(async () => {
  config.frontend = originalFrontend;
  if (originalForce === undefined) {
    delete process.env['FORCE_FRONTEND_HOSTING'];
  } else {
    process.env['FORCE_FRONTEND_HOSTING'] = originalForce;
  }
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

describe('Frontend static hosting', () => {
  it('serves static assets with ETag/304, blocks traversal/dotfiles, and falls back to index.html', async () => {
    const app = createApp({ enabled: false, allowedHosts: [], allowedOrigins: [], credentials: [] });

    const asset = await request(app).get('/assets/app.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['content-type']).toContain('text/javascript');
    expect(asset.headers['etag']).toBeTruthy();
    expect(asset.text).toBe('console.log("ok");');

    const notModified = await request(app)
      .get('/assets/app.js')
      .set('If-None-Match', asset.headers['etag']!);
    expect(notModified.status).toBe(304);

    const traversal = await request(app).get('/%2e%2e/secret.txt');
    expect(traversal.status).toBe(200);
    expect(traversal.text).toBe('<html><body>SPA</body></html>');

    const dotfile = await request(app).get('/.env');
    expect(dotfile.status).toBe(200);
    expect(dotfile.text).toBe('<html><body>SPA</body></html>');

    const spaRoute = await request(app).get('/dashboard');
    expect(spaRoute.status).toBe(200);
    expect(spaRoute.text).toBe('<html><body>SPA</body></html>');

    const health = await request(app).get('/healthz');
    expect(health.status).toBe(204);
  });
});
