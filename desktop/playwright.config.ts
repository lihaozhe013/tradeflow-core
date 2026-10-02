import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  use: { baseURL: 'http://127.0.0.1:1421', locale: 'en-US', viewport: { width: 960, height: 760 } },
  webServer: {
    command: 'bun run web:dev --port 1421',
    url: 'http://127.0.0.1:1421',
    reuseExistingServer: false
  }
});
