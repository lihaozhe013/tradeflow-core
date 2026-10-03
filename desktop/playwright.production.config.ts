import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/production',
  use: { baseURL: 'http://127.0.0.1:1422', locale: 'en-US', viewport: { width: 960, height: 760 } },
  webServer: {
    command: 'bun run scripts/serve-production.mjs',
    url: 'http://127.0.0.1:1422',
    reuseExistingServer: false
  }
});
