import { expect, test } from './fixtures';
import { apiRequest, logInAs, paginationButton, uniqueId, useEnglish } from './support';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await logInAs(page, 'superuser');
});

test('audit log filters, resets, paginates, and scopes username search to superusers', async ({
  page,
  records
}) => {
  const suffix = uniqueId('E2E-AUDIT');
  const shortName = `${suffix} Supplier`;

  try {
    for (let index = 0; index < 21; index += 1) {
      const indexedName = `${shortName} ${index}`;
      const indexedCode = `${suffix}-${index}`;
      await records.create(
        '/partners',
        { code: indexedCode, short_name: indexedName, full_name: `${indexedName} Ltd.`, type: 0 },
        `/partners/${encodeURIComponent(indexedName)}`
      );
    }

    await page.goto('/#/audit');
    await expect(page.getByText('Audit Log', { exact: true })).toBeVisible();
    await page.getByPlaceholder('Search by username').fill('test_superuser');
    await page.getByPlaceholder('Search by resource').fill('/api/partners');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('row').filter({ hasText: '/api/partners' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByPlaceholder('Search by username')).toHaveValue('');
    await expect(page.getByPlaceholder('Search by resource')).toHaveValue('');
    await expect(paginationButton(page, 'Next')).toBeEnabled();
    await paginationButton(page, 'Next').click();
    await expect(paginationButton(page, 'Previous')).toBeEnabled();

    await page.getByRole('button', { name: /Test superuser/i }).click();
    await page.getByText('Log Out', { exact: true }).click();
    await logInAs(page, 'reader');
    await page.goto('/#/audit');
    await expect(page.getByPlaceholder('Search by username')).toHaveCount(0);
    await expect(page.getByPlaceholder('Search by resource')).toBeVisible();
  } finally {
    await records.cleanup();
  }
});

test('about page renders system, company, and contact information', async ({ page }) => {
  await logInAs(page, 'reader');
  await page.goto('/#/about');
  const aboutData = await apiRequest<{ company?: { name?: string } }>(page, 'GET', '/about');
  await expect(page.getByRole('heading', { name: 'About Us' })).toBeVisible();
  await expect(page.getByText('System Information', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: aboutData.company?.name ?? 'Company Profile' }).first()
  ).toBeVisible();
  await expect(page.getByText('Contact Information', { exact: true })).toBeVisible();
});
