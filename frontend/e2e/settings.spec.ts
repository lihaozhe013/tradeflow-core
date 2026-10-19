import { expect, test } from './fixtures';
import { API_BASE_URL, apiRequest, authHeaders, logInAs, useEnglish } from './support';

interface SettingRecord {
  section: string;
  version: number;
  value: Record<string, unknown>;
}
test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await logInAs(page, 'superuser');
});

test('settings preserves drafts, saves, cancels, and reloads persisted currency', async ({
  page
}) => {
  const headers = await authHeaders(page);
  const initial = (await apiRequest<{ data: SettingRecord[] }>(page, 'GET', '/settings')).data.find(
    (row) => row.section === 'general'
  )!;
  try {
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'System Settings' })).toBeVisible();
    await page.getByLabel('Currency symbol', { exact: true }).fill('CHF');
    await page.getByRole('menuitem', { name: 'Payment methods', exact: true }).click();
    await page.getByRole('menuitem', { name: /General/ }).click();
    await expect(page.getByLabel('Currency symbol', { exact: true })).toHaveValue('CHF');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Currency symbol', { exact: true })).toHaveValue('CHF');
    await page.getByLabel('Currency symbol', { exact: true }).fill('GBP');
    await page.getByRole('button', { name: 'Cancel changes' }).click();
    await expect(page.getByLabel('Currency symbol', { exact: true })).toHaveValue('CHF');
  } finally {
    const result = await page.request.get(`${API_BASE_URL}/settings`, { headers });
    const row = (await result.json()).data.find(
      (value: SettingRecord) => value.section === 'general'
    );
    await page.request.put(`${API_BASE_URL}/settings/general`, {
      headers,
      data: { version: row.version, value: initial.value }
    });
  }
});

test('settings rejects stale saves and reloads only the conflicting section', async ({ page }) => {
  const headers = await authHeaders(page);
  const initial = (await apiRequest<{ data: SettingRecord[] }>(page, 'GET', '/settings')).data.find(
    (row) => row.section === 'general'
  )!;
  try {
    await page.goto('/#/settings');
    await page.getByLabel('Currency symbol', { exact: true }).fill('LOCAL');
    await apiRequest(page, 'PUT', '/settings/general', {
      version: initial.version,
      value: { currency_unit_symbol: 'REMOTE' }
    });
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Another update was saved' })
    ).toBeVisible();
    await expect(page.getByLabel('Currency symbol', { exact: true })).toHaveValue('LOCAL');
    await page.getByRole('button', { name: 'Reload section', exact: true }).click();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByLabel('Currency symbol', { exact: true })).toHaveValue('REMOTE');
  } finally {
    const result = await page.request.get(`${API_BASE_URL}/settings`, { headers });
    const row = (await result.json()).data.find(
      (value: SettingRecord) => value.section === 'general'
    );
    await page.request.put(`${API_BASE_URL}/settings/general`, {
      headers,
      data: { version: row.version, value: initial.value }
    });
  }
});

test('settings supports export editing and responsive previews without overflow', async ({
  page
}) => {
  await page.goto('/#/settings');
  await page.getByRole('menuitem', { name: 'Export templates', exact: true }).click();
  await expect(page.getByLabel('Worksheet name', { exact: true })).toBeVisible();
  await expect(page.getByText('Example headings only.', { exact: false })).toBeVisible();
  await page.getByLabel('Worksheet name', { exact: true }).fill('Draft partners');
  await page.getByRole('checkbox', { name: 'Show column' }).first().uncheck();
  await page.getByRole('button', { name: 'Move down', exact: true }).first().click();
  await page
    .locator('.settings-navigation')
    .getByRole('menuitem', { name: 'About', exact: true })
    .click();
  await page.getByLabel('Company name', { exact: true }).fill('Preview company');
  await expect(page.getByRole('heading', { name: 'Preview company' })).toBeVisible();
  await page.getByRole('menuitem', { name: /Export templates/ }).click();
  await expect(page.getByLabel('Worksheet name', { exact: true })).toHaveValue('Draft partners');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.getByRole('button', { name: 'Cancel changes' }).click();
  await page.getByRole('menuitem', { name: /About/ }).last().click();
  await page.getByRole('button', { name: 'Cancel changes' }).click();
});

test('ordinary users cannot open settings or About', async ({ page }) => {
  for (const role of ['reader', 'editor'] as const) {
    await logInAs(page, role);
    await expect(page.getByRole('menuitem', { name: 'System Settings', exact: true })).toHaveCount(
      0
    );
    await page.goto('/#/settings');
    await expect(page.getByText('Insufficient Permissions', { exact: true })).toBeVisible();
    await page.goto('/#/about');
    await expect(page.getByText('Insufficient Permissions', { exact: true })).toBeVisible();
  }
});

test('initial runtime failure blocks business UI and can be retried', async ({ page }) => {
  await page.route('**/api/settings/runtime', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
  );
  await page.goto('/#/inventory');
  await page.reload();
  await expect(page.getByText('Could not load system settings.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Test superuser/i })).toHaveCount(0);
  await page.unroute('**/api/settings/runtime');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: /Test superuser/i })).toBeVisible();
});

test('focus refresh preserves an open product draft and uses the new default on the next form', async ({
  page
}) => {
  const headers = await authHeaders(page);
  const initial = (await apiRequest<{ data: SettingRecord[] }>(page, 'GET', '/settings')).data.find(
    (row) => row.section === 'product-categories'
  )!;
  try {
    await page.goto('/#/products');
    await page.getByRole('button', { name: 'Add Product' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Enter code').fill('UNSAVED-DRAFT');
    await apiRequest(page, 'PUT', '/settings/product-categories', {
      version: initial.version,
      value: { list: ['New default'], default: 'New default' }
    });
    const refreshed = page.waitForResponse(
      (response) => response.url().endsWith('/api/settings/runtime') && response.status() === 200
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refreshed;
    await expect(dialog.getByPlaceholder('Enter code')).toHaveValue('UNSAVED-DRAFT');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Add Product' }).click();
    await expect(page.getByRole('dialog').getByText('New default', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally {
    const result = await page.request.get(`${API_BASE_URL}/settings`, { headers });
    const row = (await result.json()).data.find(
      (value: SettingRecord) => value.section === 'product-categories'
    );
    await page.request.put(`${API_BASE_URL}/settings/product-categories`, {
      headers,
      data: { version: row.version, value: initial.value }
    });
  }
});

test('a saved payment default is used by newly opened payable forms', async ({ page }) => {
  const headers = await authHeaders(page);
  const initial = (await apiRequest<{ data: SettingRecord[] }>(page, 'GET', '/settings')).data.find(
    (row) => row.section === 'payment-methods'
  )!;
  try {
    await page.goto('/#/settings');
    await page
      .locator('.settings-navigation')
      .getByRole('menuitem', { name: 'Payment methods', exact: true })
      .click();
    await page.getByLabel('Display name 1', { exact: true }).fill('Configured payment');
    await page.getByLabel('Default selection', { exact: true }).click();
    await page.getByText('Configured payment', { exact: true }).last().click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
    await page.goto('/#/payable');
    await page.getByRole('button', { name: 'Add Payment' }).first().click();
    await expect(
      page.getByRole('dialog').getByText('Configured payment', { exact: true })
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally {
    const result = await page.request.get(`${API_BASE_URL}/settings`, { headers });
    const row = (await result.json()).data.find(
      (value: SettingRecord) => value.section === 'payment-methods'
    );
    await page.request.put(`${API_BASE_URL}/settings/payment-methods`, {
      headers,
      data: { version: row.version, value: initial.value }
    });
  }
});
