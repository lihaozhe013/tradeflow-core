import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  apiRequest,
  expectDesktopOrNarrowLayout,
  type E2eRecords,
  logInAs,
  uniqueId,
  useEnglish
} from './support';

interface CreatedRecord {
  id: number;
}

interface PartnerFixture {
  code: string;
  short_name: string;
  full_name: string;
  type: number;
}

interface ProductFixture {
  code: string;
  product_model: string;
  category: string;
}

async function createAnalysisFixtures(
  page: Page,
  records: E2eRecords,
  explicitDate?: string
): Promise<{
  customer: PartnerFixture;
  supplier: PartnerFixture;
  product: ProductFixture;
  invoiceNumber: string;
}> {
  const suffix = uniqueId('E2E-ANALYSIS');
  const customer = {
    code: `${suffix}-CUS`,
    short_name: `${suffix} Customer`,
    full_name: `${suffix} Customer Ltd.`,
    type: 1
  };
  const supplier = {
    code: `${suffix}-SUP`,
    short_name: `${suffix} Supplier`,
    full_name: `${suffix} Supplier Ltd.`,
    type: 0
  };
  const product = {
    code: `${suffix}-PRD`,
    product_model: `${suffix}-MODEL`,
    category: 'Raw Materials'
  };
  const previousMonth = new Date();
  previousMonth.setDate(15);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const transactionDate = explicitDate ?? previousMonth.toISOString().slice(0, 10);
  const invoiceNumber = `${suffix}-INV`;

  await records.create(
    '/partners',
    customer,
    `/partners/${encodeURIComponent(customer.short_name)}`
  );
  await records.create(
    '/partners',
    supplier,
    `/partners/${encodeURIComponent(supplier.short_name)}`
  );
  await records.create('/products', product, `/products/${encodeURIComponent(product.code)}`);

  const inbound = await apiRequest<CreatedRecord>(page, 'POST', '/inbound', {
    supplier_code: supplier.code,
    product_code: product.code,
    quantity: 8,
    unit_price: 10,
    inbound_date: transactionDate,
    invoice_date: transactionDate,
    invoice_number: invoiceNumber,
    order_number: `${suffix}-IN`
  });
  records.track(`/inbound/${inbound.id}`);

  const outbound = await apiRequest<CreatedRecord>(page, 'POST', '/outbound', {
    customer_code: customer.code,
    product_code: product.code,
    quantity: 3,
    unit_price: 20,
    outbound_date: transactionDate,
    invoice_date: transactionDate,
    invoice_number: invoiceNumber,
    order_number: `${suffix}-OUT`
  });
  records.track(`/outbound/${outbound.id}`);

  return { customer, supplier, product, invoiceNumber };
}

async function expectExcelDownload(page: Page, buttonName: string): Promise<void> {
  if (
    [
      'Export Statement',
      'Inbound Statement',
      'Outbound Statement',
      'Export Invoice Details'
    ].includes(buttonName)
  ) {
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Export', exact: true }).click()
    ]);
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/i);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    return;
  }
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
}

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await logInAs(page, 'editor');
});

test('analysis filters sales and purchases and supports normal and grouped exports', async ({
  page,
  records
}) => {
  try {
    const fixture = await createAnalysisFixtures(page, records);
    await page.goto('/#/analysis');
    await expect(page.getByRole('heading', { name: 'Data Analysis' })).toBeVisible();
    const partnerFilter = page.getByRole('combobox').nth(0);
    const productFilter = page.getByRole('combobox').nth(1);
    await partnerFilter.fill(fixture.customer.code);
    await page.getByText(new RegExp(fixture.customer.code)).last().click();
    await productFilter.fill(fixture.product.product_model);
    await page.getByText(new RegExp(fixture.product.product_model)).last().click();
    await expect(page.getByText('Analysis Conditions', { exact: false })).toBeVisible();
    const conditions = page.getByRole('alert').filter({ hasText: 'Analysis Conditions:' });
    await expect(conditions).toContainText(fixture.customer.short_name);
    await expect(conditions).toContainText(fixture.product.product_model);
    await expect(
      page.getByRole('row').filter({ hasText: fixture.product.product_model })
    ).toBeVisible();

    const normalDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Data' }).click();
    expect((await normalDownload).suggestedFilename()).toMatch(/\.xlsx$/i);

    await partnerFilter.fill('All');
    await productFilter.fill('All');
    await expect(page.getByRole('button', { name: 'Export Data' })).toBeEnabled();
    await page.getByRole('button', { name: 'Export Data' }).click();
    const advancedDialog = page.getByRole('dialog');
    await expect(
      advancedDialog.getByText('Advanced Export Options', { exact: true })
    ).toBeVisible();
    const groupedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/export/advanced-analysis') &&
        response.request().method() === 'POST'
    );
    await advancedDialog.getByRole('button', { name: 'Export by Customer' }).click();
    const groupedExport = await groupedResponse;
    expect(groupedExport.ok()).toBeTruthy();
    expect(groupedExport.headers()['content-type']).toContain('spreadsheetml.sheet');
    expect(groupedExport.headers()['content-disposition']).toContain('attachment');

    await page.getByText('Purchase', { exact: true }).click();
    await partnerFilter.fill(fixture.supplier.code);
    await page.getByText(new RegExp(fixture.supplier.code)).last().click();
    await productFilter.fill(fixture.product.product_model);
    await page.getByText(new RegExp(fixture.product.product_model)).last().click();
    await expect(page.getByRole('alert').filter({ hasText: 'Analysis Conditions:' })).toContainText(
      fixture.supplier.short_name
    );
    await expect(
      page.getByRole('row').filter({ hasText: fixture.product.product_model })
    ).toBeVisible();

    await partnerFilter.fill('All');
    await productFilter.fill('All');
    await page.getByRole('button', { name: 'Export Data' }).click();
    const supplierExport = page.getByRole('dialog');
    const supplierResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/export/advanced-analysis') &&
        response.request().method() === 'POST'
    );
    await supplierExport.getByRole('button', { name: 'Export by Supplier' }).click();
    const supplierExportResponse = await supplierResponse;
    expect(supplierExportResponse.ok()).toBeTruthy();
    expect(supplierExportResponse.headers()['content-type']).toContain('spreadsheetml.sheet');
    expect(supplierExportResponse.headers()['content-disposition']).toContain('attachment');
  } finally {
    await records.cleanup();
  }
});

test('export page shows dedicated reports and shortcuts and handles failed responses', async ({
  page,
  records
}) => {
  try {
    const fixture = await createAnalysisFixtures(
      page,
      records,
      new Date().toISOString().slice(0, 10)
    );
    await page.goto('/#/export');
    await expect(page.getByText('Quick links', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Products' })).toHaveAttribute(
      'href',
      '#/products'
    );
    await expectExcelDownload(page, 'Export Statement');
    await expectExcelDownload(page, 'Inbound Statement');
    await expectExcelDownload(page, 'Outbound Statement');

    await page.getByPlaceholder('Required').fill(fixture.customer.code);
    await expectExcelDownload(page, 'Export Invoice Details');

    await page.route('**/api/export/previews/reports', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"message":"Report preview failed"}'
      })
    );
    await page.getByRole('button', { name: 'Export Statement', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
    await expect(page.getByText('Report preview failed', { exact: true }).first()).toBeVisible();
  } finally {
    await records.cleanup();
  }
});

test.describe('mobile export', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps date filters usable and downloads a report', async ({ page, records }) => {
    try {
      await createAnalysisFixtures(page, records, new Date().toISOString().slice(0, 10));
      await page.goto('/#/export');
      await expect(page.getByText('Quick links', { exact: true })).toBeVisible();
      await expect(page.locator('.responsive-date-range .ant-picker')).toHaveCount(4);
      await expectDesktopOrNarrowLayout(page);

      await expectExcelDownload(page, 'Export Statement');
      await expectDesktopOrNarrowLayout(page);
    } finally {
      await records.cleanup();
    }
  });
});

test('business tables expose export previews with localized column headings', async ({ page }) => {
  for (const route of [
    '/partners',
    '/products',
    '/product-prices',
    '/inventory',
    '/receivable',
    '/payable'
  ]) {
    await page.goto(`/#${route}`);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Export preview', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
    await expect(dialog.getByRole('table').first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

test('export preview preserves server template headings', async ({ page }) => {
  await page.route('**/api/export/previews/records', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.columns[0].label = 'Custom system heading';
    await route.fulfill({ response, json: body });
  });
  await page.goto('/#/products');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('columnheader', { name: 'Custom system heading' })
  ).toBeVisible();
});
