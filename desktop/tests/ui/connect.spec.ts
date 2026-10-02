import { expect, test, type Page } from '@playwright/test';
async function mockNative(page: Page, failLogin = false) {
  await page.addInitScript(
    ({ failLogin }) => {
      const tools = ['search_partners', 'search_products', 'get_inventory', 'list_transactions'];
      let profiles: unknown[] = [];
      const calls: string[] = [];
      Object.assign(window, {
        __nativeCalls: calls,
        __TAURI_INTERNALS__: {
          invoke: async (command: string) => {
            calls.push(command);
            if (command === 'profiles') return profiles;
            if (command === 'detect_clients')
              return [
                {
                  client: 'opencode',
                  installed: true,
                  supported: true,
                  version: 'opencode v2.0.21'
                }
              ];
            if (command === 'login') {
              if (failLogin) throw 'HTTP_401';
              return {
                user: { username: 'reader', role: 'reader', display_name: 'Test reader' },
                capabilities: { enabled: true, allowedTools: tools }
              };
            }
            if (command === 'connect_agent') {
              profiles = [
                {
                  id: 'test-profile',
                  client: 'opencode',
                  ownerUsername: 'reader',
                  serverName: 'tradeflow_test',
                  baseUrl: 'https://tradeflow.example.com',
                  tools,
                  expiresAt: '2030-01-01',
                  configPath: '/private/config.jsonc',
                  mode: 'remote',
                  pendingCleanup: []
                }
              ];
              return { configurationWritten: true, serviceVerified: true, hostVerified: false };
            }
            if (command === 'connection_prompts')
              return {
                business: 'Use the TradeFlow read-only inventory tool.',
                repair: 'Run the bundled helper doctor command.'
              };
            return null;
          }
        }
      });
    },
    { failLogin }
  );
}
async function signIn(page: Page) {
  await page.getByLabel('TradeFlow server URL').fill('https://tradeflow.example.com');
  await page.getByLabel('Username', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in and check server' }).click();
}
test('requires login and clears passwords after a rejected login', async ({ page }) => {
  await mockNative(page, true);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create credential and connect' })).toBeDisabled();
  await signIn(page);
  await expect(page.getByRole('status')).toContainText('HTTP_401');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Create credential and connect' })).toBeDisabled();
});
test('shows reader scope, keeps host verification pending and copies through Rust', async ({
  page
}) => {
  await mockNative(page);
  await page.goto('/');
  await signIn(page);
  await expect(page.getByText('Test reader')).toBeVisible();
  await expect(page.getByText('get_analysis', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create credential and connect' }).click();
  await expect(page.getByText('tradeflow_test', { exact: true })).toBeVisible();
  await expect(
    page.getByText('After configuration and service checks pass', { exact: false })
  ).toBeVisible();
  await expect(page.locator('pre')).toContainText('"hostVerified": false');
  await page.getByRole('button', { name: 'Copy business prompt' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied');
  expect(
    await page.evaluate(() => (window as unknown as { __nativeCalls: string[] }).__nativeCalls)
  ).toContain('copy_prompt');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to renew credential' })).toBeDisabled();
});
