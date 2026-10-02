import { expect, test } from './fixtures';
import { logInAs, useEnglish } from './support';
test('reader lists credentials, revokes a batch and retries only failed items', async ({
  page
}) => {
  await useEnglish(page);
  await logInAs(page, 'reader');
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const removed = new Set<string>();
  const attempts: string[] = [];
  await page.route('**/api/mcp/connections?*', async (route) => {
    await route.fulfill({
      json: {
        data: ids.map((id) => ({
          id,
          client: 'opencode',
          deviceId: 'fixture-device',
          tools: ['get_inventory'],
          effectiveTools: ['get_inventory'],
          createdAt: '2026-01-01',
          expiresAt: '2030-01-01',
          revokedAt: removed.has(id) ? '2026-01-01' : null,
          status: removed.has(id) ? 'revoked' : 'active'
        })),
        pagination: { page: 1, limit: 20, total: 2, pages: 1 }
      }
    });
  });
  await page.route('**/api/mcp/connections/*', async (route) => {
    const id = route.request().url().split('/').at(-1)!;
    attempts.push(id);
    if (id === ids[1] && attempts.filter((value) => value === id).length === 1)
      await route.fulfill({ status: 503, json: { code: 'CONNECTION_OPERATION_FAILED' } });
    else {
      removed.add(id);
      await route.fulfill({ status: 204 });
    }
  });
  await page.goto('/#/mcp-connections');
  await expect(page.getByRole('heading', { name: 'My MCP credentials' })).toBeVisible();
  await expect(
    page.getByText('MCP is disabled. You can still view and revoke your credentials.')
  ).toBeVisible();
  await page.getByRole('row').first().getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Revoke selected' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByText('Revoked 1 of 2 credentials')).toBeVisible();
  await page.getByRole('button', { name: 'Retry failed items' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByText('Revoked 1 of 1 credentials')).toBeVisible();
  expect(attempts.filter((id) => id === ids[0])).toHaveLength(1);
  expect(attempts.filter((id) => id === ids[1])).toHaveLength(2);
});
