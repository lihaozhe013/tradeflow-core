import { expect, test, type Page } from '@playwright/test';
const old = {
  id: 'old-profile',
  connectionId: 'old-credential',
  client: 'opencode',
  ownerUsername: 'reader',
  baseUrl: 'http://localhost:8000',
  serverName: 'tradeflow_old',
  configPath: '/private/config.jsonc',
  mode: 'remote',
  tools: ['get_inventory'],
  configurationWritten: true,
  expiresAt: '2030-01-01'
};
async function mock(
  page: Page,
  options: {
    profiles?: unknown[];
    failLogin?: boolean;
    failConnect?: boolean;
    secondAgent?: boolean;
  } = {}
) {
  await page.addInitScript((options) => {
    let profiles = options.profiles ?? [];
    let logs: unknown[] = [];
    const calls: Array<{ command: string; args: Record<string, unknown> }> = [];
    const callbacks = new Map<number, (value: unknown) => void>();
    let listener = 0;
    const result = (action: string, stage: string, failure: boolean) => {
      const event = {
        operationId: `${action}-operation`,
        timestamp: new Date().toISOString(),
        action,
        stage,
        status: failure ? 'failed' : 'succeeded',
        client: 'opencode',
        server: 'https://new.example.com',
        durationMs: 10,
        errorCode: failure ? 'HTTP_401' : null,
        httpStatus: failure ? 401 : null
      };
      logs.push(event);
      callbacks.get(listener)?.({ event: 'connect-operation', id: 1, payload: event });
      return {
        operation: {
          operationId: event.operationId,
          status: event.status,
          failedStage: failure ? stage : null,
          errorCode: event.errorCode,
          logAvailable: true,
          events: [event]
        },
        ...(failure ? { errorCode: 'HTTP_401' } : {})
      };
    };
    Object.assign(window, {
      __nativeCalls: calls,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        transformCallback: (callback: (value: unknown) => void) => {
          const id = callbacks.size + 1;
          callbacks.set(id, callback);
          return id;
        },
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          calls.push({ command, args });
          if (command === 'plugin:event|listen') {
            listener = args.handler as number;
            return 1;
          }
          if (command === 'get_settings') return { language: 'en' };
          if (command === 'recover_switches') return [];
          if (command === 'profiles') return profiles;
          if (command === 'pending_revocations')
            return [
              {
                baseUrl: 'http://localhost:8000',
                client: 'opencode',
                ownerUsername: 'reader',
                connectionId: 'old-credential',
                lastError: 'LOCAL_ONLY'
              }
            ];
          if (command === 'operation_logs') return logs;
          if (command === 'detect_clients')
            return [
              { client: 'opencode', installed: true, supported: true, version: 'opencode v2.0.21' },
              ...(options.secondAgent
                ? [{ client: 'workbuddy', installed: true, supported: true, version: '5.6.0' }]
                : [])
            ];
          if (command === 'login') {
            if (options.failLogin) throw result('login', 'login', true);
            return {
              ...result('login', 'capabilities', false),
              baseUrl: args.server,
              user: { username: 'reader', role: 'reader', display_name: 'Test reader' },
              capabilities: { enabled: true, allowedTools: ['get_inventory'] }
            };
          }
          if (command === 'connect_agent') {
            if (options.failConnect && args.client === 'opencode')
              throw result('connect', 'mcp_handshake', true);
            const profile = {
              id: `${args.client}-profile`,
              connectionId: 'new-id',
              client: args.client,
              ownerUsername: 'reader',
              baseUrl: 'https://new.example.com',
              configPath: '/private/config.jsonc',
              mode: 'remote',
              tools: ['get_inventory'],
              configurationWritten: true
            };
            profiles = [
              ...profiles.filter((p) => (p as { client: unknown }).client !== args.client),
              profile
            ];
            return {
              ...result('connect', 'commit_local', false),
              profile,
              configurationWritten: true,
              serviceVerified: true
            };
          }
          if (command === 'disconnect_agent') {
            profiles = profiles.filter((p) => (p as { id: string }).id !== args.profile);
            return {
              ...result('remove', 'remove_local', false),
              localRemoved: true,
              remoteRevoked: false,
              reloadRequired: true
            };
          }
          if (command === 'connection_prompts')
            return {
              business:
                args.language === 'zh'
                  ? '使用 limit:5 查询库存。'
                  : 'Use limit:5 to query inventory.',
              repair: 'Run doctor with a redacted report.'
            };
          if (command === 'export_operation_logs') return { exported: true };
          return null;
        }
      }
    });
  }, options);
}
async function signIn(page: Page) {
  await page.getByLabel('TradeFlow server URL').fill('https://new.example.com');
  await page.getByLabel('Username', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in and check server' }).click();
}
test('uses one login flow to replace the old server and keeps cleanup off the home screen', async ({
  page
}) => {
  await mock(page, { profiles: [old] });
  await page.goto('/');
  await signIn(page);
  await expect(page.getByText('This will replace local connections')).toBeVisible();
  await page.getByRole('button', { name: 'Connect selected agents' }).click();
  await expect(
    page.getByText('Service verified. Reload the Agent and run one query.').first()
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Remote cleanup records' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Remote cleanup records' })).toBeVisible();
  await page.getByRole('button', { name: 'Export diagnostic report' }).click();
  await expect(page.getByText('Diagnostic report exported')).toBeVisible();
});
test('failed login replaces stale removal results and exposes the failed step', async ({
  page
}) => {
  await mock(page, { profiles: [old], failLogin: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Remove local configuration', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm disconnect' }).click();
  await expect(
    page.getByText('Local configuration removed. Reload the Agent.').first()
  ).toBeVisible();
  await signIn(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Sign in again' })).toBeVisible();
  await expect(page.getByText('Local configuration removed. Reload the Agent.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Diagnostics', exact: true })).toBeVisible();
  await page
    .locator('.operation-history')
    .first()
    .getByText(/Sign in/)
    .first()
    .click();
  await expect(page.locator('.operation-history').first()).toContainText('HTTP_401');
  await expect(page.locator('main')).not.toContainText('fixture-password');
});
test('records separate results when one Agent fails and the other succeeds', async ({ page }) => {
  await mock(page, { failConnect: true, secondAgent: true });
  await page.goto('/');
  await signIn(page);
  await page.getByRole('button', { name: 'Connect selected agents' }).click();
  await expect(page.getByRole('heading', { name: 'OpenCode · Failed' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'WorkBuddy · Completed' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('MCP handshake');
});
test('Chinese local removal works without login and narrow layouts do not overflow', async ({
  page
}) => {
  await mock(page, { profiles: [old] });
  await page.setViewportSize({ width: 720, height: 600 });
  await page.goto('/');
  await page.getByLabel('Language', { exact: true }).selectOption('zh');
  await page.getByRole('button', { name: '移除本地配置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认断开' }).click();
  await expect(page.getByText('本地配置已移除，请重载 Agent。').first()).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativeCalls: Array<{ command: string; args: unknown }> })
        .__nativeCalls
  );
  expect(calls.find((c) => c.command === 'disconnect_agent')?.args).toEqual({
    profile: 'old-profile',
    mode: 'local'
  });
  expect(calls.some((c) => c.command === 'login')).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
