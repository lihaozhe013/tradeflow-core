import { expect, test } from '@playwright/test';
import { logInAs, useEnglish } from './support';

test.beforeEach(async ({ page }) => useEnglish(page));

test('redirects protected pages to login and rejects invalid credentials', async ({ page }) => {
  await page.goto('/#/inventory');
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByRole('heading', { name: 'TradeFlow System' })).toBeVisible();

  await page.getByPlaceholder('Username').fill('test_editor');
  await page.getByPlaceholder('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.locator('.ant-alert-error')).toBeVisible();
});

test('loads every application page for an editor and supports logout', async ({ page }) => {
  await logInAs(page, 'editor');
  await page.goto('/#/');
  await expect(page).toHaveURL(/#\/overview$/);
  await page.getByRole('menuitem', { name: 'Products' }).click();
  await expect(page).toHaveURL(/#\/products$/);

  const pages = [
    ['overview', 'Overview'],
    ['inbound', 'Inbound'],
    ['outbound', 'Outbound'],
    ['inventory', 'Inventory'],
    ['partners', 'Partners'],
    ['products', 'Products'],
    ['product-prices', 'Product Prices'],
    ['receivable', 'Receivable'],
    ['payable', 'Payable'],
    ['analysis', 'Data Analysis'],
    ['export', 'Base Info'],
    ['audit', 'Audit Log'],
    ['users', 'My Profile'],
    ['about', 'About Us']
  ] as const;

  for (const [route, pageText] of pages) {
    await page.goto(`/#/${route}`);
    await expect(page.getByText(pageText, { exact: true }).first()).toBeVisible();
  }

  await page.getByRole('button', { name: /Test editor/i }).click();
  await page.getByText('Log Out', { exact: true }).click();
  await expect(page).toHaveURL(/#\/login$/);
});

test('enforces reader, editor, and superuser page and action access', async ({ page }) => {
  await logInAs(page, 'reader');
  await page.goto('/#/');
  await expect(page).toHaveURL(/#\/inbound$/);
  await expect(page.getByRole('menuitem', { name: 'Overview' })).toHaveCount(0);
  await page.goto('/#/overview');
  await expect(page.getByText('Insufficient Permissions', { exact: true })).toBeVisible();
  await page.goto('/#/partners');
  await expect(page.getByRole('heading', { name: 'Partners' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Partner' })).toHaveCount(0);
  await page.goto('/#/users');
  await expect(page.getByText('My Profile', { exact: true })).toBeVisible();
  await expect(page.getByText('User List', { exact: true })).toHaveCount(0);

  await page.goto('/#/login');
  await logInAs(page, 'editor');
  await expect(page.getByRole('menuitem', { name: 'Overview' })).toBeVisible();
  await page.goto('/#/partners');
  await expect(page.getByRole('button', { name: 'Add Partner' })).toBeVisible();
  await expect(page.getByText('User List', { exact: true })).toHaveCount(0);

  await page.goto('/#/login');
  await logInAs(page, 'superuser');
  await expect(page.getByRole('menuitem', { name: 'Overview' })).toBeVisible();
  await page.goto('/#/users');
  await expect(page.getByText('User List', { exact: true })).toBeVisible();
  await page.goto('/#/audit');
  await expect(page.getByPlaceholder('Search by username')).toBeVisible();
});

test.describe('narrow viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps navigation, primary forms, and dense page content usable', async ({ page }) => {
    await useEnglish(page);
    await page.goto('/#/login');
    await expect(page.getByPlaceholder('Username')).toBeVisible();
    await logInAs(page, 'editor');

    for (const [route, title] of [
      ['inbound', 'Inbound'],
      ['outbound', 'Outbound'],
      ['inventory', 'Inventory'],
      ['partners', 'Partners'],
      ['products', 'Products'],
      ['product-prices', 'Product Prices'],
      ['receivable', 'Receivable'],
      ['payable', 'Payable'],
      ['analysis', 'Data Analysis'],
      ['export', 'Base Info'],
      ['audit', 'Audit Log'],
      ['users', 'My Profile']
    ] as const) {
      await page.goto(`/#/${route}`);
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    }

    await page.goto('/#/partners');
    await expect(page.getByRole('button', { name: 'Add Partner' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Partner' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
