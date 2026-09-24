import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(frontendDir, '..');
const backendDir = path.join(repositoryRoot, 'backend');
const configDir = path.resolve(
  process.env['TRADEFLOW_CONFIG_DIR'] ?? path.join(backendDir, 'test-config')
);
const backendUrl = 'http://127.0.0.1:18080';
const frontendUrl = 'http://127.0.0.1:15173';
const headless = ['1', 'true'].includes(process.env['TRADEFLOW_E2E_HEADLESS']?.toLowerCase() ?? '');
const externalServer = ['1', 'true'].includes(
  process.env['TRADEFLOW_E2E_EXTERNAL_SERVER']?.toLowerCase() ?? ''
);

const backendWebServer = externalServer
  ? []
  : [
      {
        command: 'bun run dev',
        cwd: backendDir,
        url: `${backendUrl}/api/auth/me`,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TRADEFLOW_CONFIG_DIR: configDir
        }
      }
    ];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: externalServer ? backendUrl : frontendUrl,
    headless,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    ...backendWebServer,
    ...(externalServer
      ? []
      : [
          {
            command: 'bun run vite --host 127.0.0.1 --port 15173 --strictPort',
            cwd: frontendDir,
            url: frontendUrl,
            timeout: 120_000,
            reuseExistingServer: false,
            env: {
              ...process.env,
              TRADEFLOW_API_URL: backendUrl
            }
          }
        ])
  ]
});
