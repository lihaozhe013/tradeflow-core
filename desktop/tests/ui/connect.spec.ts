import { expect, test, type Page } from '@playwright/test';
const profile = {
  id: '6f0e0d3a-6a0f-4b53-9a2b-0f0f8e7d6c5b',
  connectionId: '5d3c2b1a-0f9e-4d8c-9b7a-6f5e4d3c2b1a',
  client: 'Office assistant',
  ownerUsername: 'reader',
  baseUrl: 'https://new.example.com',
  serverName: 'tradeflow_6f0e0d3a6a0f4b539a2b0f0f8e7d6c5b',
  mode: 'bridge',
  tools: ['get_inventory', 'search_products'],
  expiresAt: '2030-01-01T00:00:00Z',
  pendingCleanup: [],
  catalogVersion: 'catalog-1',
  guideVersion: '2',
  lastSyncAt: '2026-10-03T10:00:00Z'
};
async function mock(
  page: Page,
  options: {
    profiles?: unknown[];
    failLogin?: boolean;
    syncAdded?: string[];
    longPrompt?: boolean;
    failCopy?: boolean;
    savedSession?: boolean;
    restoreFailsOnce?: boolean;
  } = {}
) {
  await page.addInitScript(
    (options) => {
      const profile = options.profile!;
      let profiles = options.profiles ?? [];
      let logs: unknown[] = [];
      const calls: Array<{ command: string; args: Record<string, unknown> }> = [];
      const callbacks = new Map<number, (value: unknown) => void>();
      let listener = 0;
      let restores = 0;
      let savedSession = options.savedSession ?? false;
      const result = (action: string, stage: string, failure: boolean) => {
        const event = {
          operationId: `${action}-operation`,
          timestamp: new Date().toISOString(),
          action,
          stage,
          status: failure ? 'failed' : 'succeeded',
          client: 'Office assistant',
          server: 'https://new.example.com',
          durationMs: 10,
          errorCode: failure ? 'HTTP_401' : null,
          httpStatus: failure ? 401 : null
        };
        logs = [...logs, event];
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
            if (command === 'restore_session') {
              if (options.restoreFailsOnce && restores++ === 0) throw 'NETWORK_CONNECTION_FAILED';
              return savedSession
                ? {
                    restored: true,
                    remembered: true,
                    baseUrl: 'https://new.example.com',
                    user: { username: 'reader', role: 'reader', display_name: 'Test reader' },
                    capabilities: { enabled: true, allowedTools: ['get_inventory'] }
                  }
                : { restored: false };
            }
            if (command === 'logout') {
              savedSession = false;
              return {};
            }
            if (command === 'recover_operations') return [];
            if (command === 'profiles') return profiles;
            if (command === 'pending_revocations')
              return [
                {
                  baseUrl: 'https://old.example.com',
                  client: 'Old assistant',
                  ownerUsername: 'reader',
                  connectionId: 'old-credential',
                  lastError: 'LOCAL_ONLY'
                }
              ];
            if (command === 'operation_logs') return logs;
            if (command === 'crash_reports') return [];
            if (command === 'login') {
              if (options.failLogin) throw result('login', 'capabilities', true);
              return {
                ...result('login', 'capabilities', false),
                baseUrl: args.server,
                remembered: args.remember === true,
                user: { username: 'reader', role: 'reader', display_name: 'Test reader' },
                capabilities: { enabled: true, allowedTools: ['get_inventory'] }
              };
            }
            if (command === 'connect_connection') {
              const created = { ...profile, client: args.name };
              profiles = [...profiles, created];
              return {
                ...result('connect', 'commit_local', false),
                profile: created,
                serviceVerified: true,
                hostActivationRequired: true
              };
            }
            if (command === 'sync_connection') {
              const added = options.syncAdded ?? [];
              return {
                ...result('sync', 'sync_catalog', false),
                profile,
                added,
                removed: [],
                changed: added.length > 0
              };
            }
            if (command === 'diagnose')
              return { ...result('doctor', 'sample_query', false), serviceVerified: true };
            if (command === 'disconnect_connection') {
              profiles = profiles.filter((item) => (item as { id: string }).id !== args.profile);
              return {
                ...result('remove', 'remove_local', false),
                localRemoved: true,
                remoteRevoked: args.mode === 'revoke'
              };
            }
            if (command === 'connection_prompts')
              return {
                business: 'Use get_inventory with "limit":5 to query inventory.',
                connect: options.longPrompt
                  ? 'Register a local stdio server named tradeflow_test.\n'.repeat(180)
                  : 'Register a local stdio server named tradeflow_test.',
                update: 'Re-discover the tools and report tool changes.',
                repair: 'Run doctor with a redacted report.'
              };
            if (command === 'copy_prompt') {
              if (options.failCopy) throw 'CLIPBOARD_WRITE_FAILED';
              return null;
            }
            if (command === 'retry_pending_revocations') return { revoked: 1, remaining: 0 };
            if (command === 'export_operation_logs') return { exported: true };
            if (command === 'open_credentials_page') return null;
            return null;
          }
        }
      });
    },
    { ...options, profile }
  );
}
async function signIn(page: Page) {
  await page.getByLabel('TradeFlow server URL').fill('https://new.example.com');
  await page.getByLabel('Username', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in and check server' }).click();
}
test('creates a connection and hands a connect prompt to the Agent', async ({ page }) => {
  await mock(page, { profiles: [] });
  await page.goto('/');
  await signIn(page);
  await page.getByLabel('Connection name').fill('Office assistant');
  await page.getByRole('button', { name: 'Create connection' }).click();
  await expect(
    page.getByText('Prompt copied. Paste it into the Agent you want to connect.')
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prompt preview' })).toBeVisible();
  await expect(page.locator('.prompt-text')).toContainText('local stdio server');
  await expect(page.getByRole('heading', { name: 'Office assistant' })).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativeCalls: Array<{ command: string; args: unknown }> })
        .__nativeCalls
  );
  expect(calls.find((call) => call.command === 'connect_connection')?.args).toEqual({
    name: 'Office assistant',
    existing: null,
    mode: 'bridge'
  });
  await expect(page.getByText('The assistant never edits Agent configuration.')).toBeVisible();
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Credentials awaiting revocation' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Export diagnostic report' }).click();
  await expect(page.getByText('Diagnostic report exported')).toBeVisible();
});
test('restores saved app sign-in without asking for a password and can sign out', async ({
  page
}) => {
  await mock(page, { profiles: [profile], savedSession: true });
  await page.goto('/');
  await expect(
    page.getByText('Sign-in saved securely on this device. App upgrades preserve it.')
  ).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sync latest capabilities', exact: true }).click();
  const calls = await page.evaluate(
    () => (window as unknown as { __nativeCalls: Array<{ command: string }> }).__nativeCalls
  );
  expect(calls.some((call) => call.command === 'login')).toBe(false);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Office assistant' })).toBeVisible();
});

test('offline restore can be retried without deleting the saved session', async ({ page }) => {
  await mock(page, { profiles: [profile], savedSession: true, restoreFailsOnce: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Retry saved sign-in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test reader' })).toBeVisible();
  const calls = await page.evaluate(
    () => (window as unknown as { __nativeCalls: Array<{ command: string }> }).__nativeCalls
  );
  expect(calls.filter((call) => call.command === 'restore_session')).toHaveLength(2);
  expect(calls.some((call) => call.command === 'logout' || call.command === 'login')).toBe(false);
});

test('remembering app sign-in is optional', async ({ page }) => {
  await mock(page);
  await page.goto('/');
  await page.getByRole('checkbox', { name: 'Stay signed in on this device' }).uncheck();
  await signIn(page);
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          __nativeCalls: Array<{ command: string; args: Record<string, unknown> }>;
        }
      ).__nativeCalls
  );
  expect(calls.find((call) => call.command === 'login')?.args.remember).toBe(false);
});

test('sync reports added tools without reissuing a credential', async ({ page }) => {
  await mock(page, { profiles: [profile], syncAdded: ['get_new_report'] });
  await page.goto('/');
  await signIn(page);
  await page.getByRole('button', { name: 'Sync latest capabilities' }).click();
  await expect(
    page.getByText('The tool catalog changed. Reload the Agent or start a new session.')
  ).toBeVisible();
  await expect(page.locator('.sync-result')).toContainText('get_new_report');
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativeCalls: Array<{ command: string; args: unknown }> })
        .__nativeCalls
  );
  expect(calls.some((call) => call.command === 'connect_connection')).toBe(false);
});
test('failed login replaces stale removal results and exposes the failed step', async ({
  page
}) => {
  await mock(page, { profiles: [profile], failLogin: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Remove connection' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove local connection only' })
    .click();
  await expect(
    page.getByText('Removed locally. The server credential is still waiting to be revoked.')
  ).toBeVisible();
  await signIn(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Sign in again' })).toBeVisible();
  await expect(
    page.getByText('Removed locally. The server credential is still waiting to be revoked.')
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Diagnostics', exact: true })).toBeVisible();
  await expect(page.locator('.operation-history').first()).toContainText('HTTP_401');
  await expect(page.locator('main')).not.toContainText('fixture-password');
});
test('each prompt has an explicit copy action and Chinese UI requests English instructions', async ({
  page
}) => {
  await mock(page, { profiles: [profile] });
  await page.goto('/');
  await page.getByLabel('Language', { exact: true }).selectOption('zh');
  const panel = page.locator('.prompt-panel');
  await expect(panel.locator('.prompt-text')).toContainText('local stdio server');
  for (const [kind, label] of [
    ['connect', '接入'],
    ['update', '更新'],
    ['business', '业务'],
    ['repair', '修复']
  ]) {
    await panel.getByRole('button', { name: `复制 · ${label}`, exact: true }).click();
    await expect(panel.getByRole('button', { name: `复制 · ${label}`, exact: true })).toContainText(
      '已复制'
    );
    const last = await page.evaluate(() =>
      (
        window as unknown as { __nativeCalls: Array<{ command: string; args: unknown }> }
      ).__nativeCalls
        .filter((call) => call.command === 'copy_prompt')
        .at(-1)
    );
    expect(last?.args).toEqual({ profile: profile.id, kind, language: 'en' });
  }
  await panel.getByRole('button', { name: '修复', exact: true }).click();
  await panel.getByRole('button', { name: '已复制', exact: true }).click();
  await page.getByLabel('语言', { exact: true }).selectOption('en');
  await expect(panel.locator('.prompt-text')).toContainText('Run doctor');
});

test('clipboard failures never show a successful copy state', async ({ page }) => {
  await mock(page, { profiles: [profile], failCopy: true });
  await page.goto('/');
  await page
    .locator('.prompt-panel')
    .getByRole('button', { name: 'Copy · Connect', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.prompt-copy').filter({ hasText: 'Copied' })).toHaveCount(0);
});

test('window stays fixed while connection and prompt panes scroll independently', async ({
  page
}, testInfo) => {
  await mock(page, {
    profiles: Array.from({ length: 10 }, (_, index) => ({
      ...profile,
      id: `${profile.id}-${index}`,
      client: `Assistant ${index}`
    })),
    longPrompt: true
  });
  await page.setViewportSize({ width: 960, height: 760 });
  await page.goto('/');
  const text = page.locator('.prompt-text');
  await expect(text).toContainText('local stdio server');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.screenshot({ path: testInfo.outputPath('workspace-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('workspace-dark.png') });
  for (const size of [
    { width: 960, height: 760 },
    { width: 720, height: 600 }
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth
      }))
    ).toEqual({ height: size.height, width: size.width });
    const headingY = (await page.locator('.prompt-header').boundingBox())!.y;
    await text.evaluate((element) => {
      element.scrollTop = 300;
    });
    expect(await text.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect((await page.locator('.prompt-header').boundingBox())!.y).toBe(headingY);
    await page.locator('.management-pane').evaluate((element) => {
      element.scrollTop = 500;
    });
    expect(
      await page.locator('.management-pane').evaluate((element) => element.scrollTop)
    ).toBeGreaterThan(0);
    expect((await text.boundingBox())!.height).toBeGreaterThan(100);
  }
  await page.getByRole('button', { name: 'Check connection', exact: true }).first().click();
  await expect(page.locator('.operation-status')).toBeVisible();
  expect((await text.boundingBox())!.height).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(600);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('button', { name: 'Prompt preview', exact: true }).click();
  await expect(text).toBeVisible();
  expect((await text.boundingBox())!.height).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(667);
  await page.getByRole('button', { name: 'Connections', exact: true }).last().click();
  await expect(page.locator('.management-pane')).toBeVisible();
});

test('Chinese local removal works without login and narrow layouts do not overflow', async ({
  page
}) => {
  await mock(page, { profiles: [profile] });
  await page.setViewportSize({ width: 720, height: 600 });
  await page.goto('/');
  await page.getByLabel('Language', { exact: true }).selectOption('zh');
  await page.getByRole('button', { name: '移除连接', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '仅移除本地连接' }).click();
  await expect(page.getByText('已移除本地连接，服务器凭证仍待撤销。').first()).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativeCalls: Array<{ command: string; args: unknown }> })
        .__nativeCalls
  );
  expect(calls.find((call) => call.command === 'disconnect_connection')?.args).toEqual({
    profile: profile.id,
    mode: 'local'
  });
  expect(calls.some((call) => call.command === 'login')).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
