import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tradeflow.language', 'en');
  });
});

async function logIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/#/login');
  await page.getByPlaceholder('Username').fill(username);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
}

test('redirects unauthenticated visitors to login and rejects invalid credentials', async ({
  page
}) => {
  await page.goto('/#/inventory');
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByRole('heading', { name: 'TradeFlow System' })).toBeVisible();

  await page.getByPlaceholder('Username').fill('test_editor');
  await page.getByPlaceholder('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.locator('.ant-alert-error')).toBeVisible();
});

test('allows an editor to log in and load core business screens', async ({ page }) => {
  await logIn(page, 'test_editor', 'testpass123');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  const screens = [
    { route: 'inbound', title: 'Inbound' },
    { route: 'outbound', title: 'Outbound' },
    { route: 'inventory', title: 'Inventory' },
    { route: 'partners', title: 'Partners' },
    { route: 'products', title: 'Products' }
  ];

  for (const screen of screens) {
    await page.goto(`/#/${screen.route}`);
    await expect(page.getByRole('heading', { name: screen.title })).toBeVisible();
  }
});

test('keeps reader users out of editor-only pages', async ({ page }) => {
  await logIn(page, 'test_reader', 'testpass123');
  await expect(page.getByRole('heading', { name: 'Inbound' })).toBeVisible();

  await page.goto('/#/overview');
  await expect(page.getByText('Insufficient Permissions', { exact: true })).toBeVisible();
});
