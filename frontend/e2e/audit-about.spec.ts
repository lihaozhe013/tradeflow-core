import { expect, test } from '@playwright/test';
import { E2eRecords, logInAs, uniqueId, useEnglish } from './support';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await logInAs(page, 'superuser');
});

test('audit log filters, resets, paginates, and scopes username search to superusers', async ({
  page
}) => {
  const records = new E2eRecords(page);
  const suffix = uniqueId('E2E-AUDIT');
  const shortName = `${suffix} Supplier`;

  try {
    await records.create(
      '/partners',
      { code: suffix, short_name: shortName, full_name: `${shortName} Ltd.`, type: 0 },
      `/partners/${encodeURIComponent(shortName)}`
    );

    await page.goto('/#/audit');
    await expect(page.getByText('Audit Log', { exact: true })).toBeVisible();
    await page.getByPlaceholder('Search username').fill('test_superuser');
    await page.getByPlaceholder('Search by resource').fill('/api/partners');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: '/api/partners' })).toBeVisible();

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByPlaceholder('Search username')).toHaveValue('');
    await expect(page.getByPlaceholder('Search by resource')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Next Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect(page.getByRole('button', { name: 'Previous Page' })).toBeEnabled();

    await page.getByRole('button', { name: /Test superuser/i }).click();
    await page.getByText('Log Out', { exact: true }).click();
    await logInAs(page, 'reader');
    await page.goto('/#/audit');
    await expect(page.getByPlaceholder('Search username')).toHaveCount(0);
    await expect(page.getByPlaceholder('Search by resource')).toBeVisible();
  } finally {
    await logInAs(page, 'superuser');
    await records.cleanup();
  }
});

test('about page renders system, company, and contact information', async ({ page }) => {
  await logInAs(page, 'reader');
  await page.goto('/#/about');
  await expect(page.getByRole('heading', { name: 'About Us' })).toBeVisible();
  await expect(page.getByText('System Information', { exact: true })).toBeVisible();
  await expect(page.getByText('Company Profile', { exact: true })).toBeVisible();
  await expect(page.getByText('Contact Information', { exact: true })).toBeVisible();
});
