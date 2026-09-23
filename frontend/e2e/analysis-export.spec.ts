import { expect, test, type Page } from '@playwright/test';
import { apiRequest, E2eRecords, logInAs, uniqueId, useEnglish } from './support';

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
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName, exact: true }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
}

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await logInAs(page, 'editor');
});

test('analysis filters sales and purchases and supports normal and grouped exports', async ({
  page
}) => {
  const records = new E2eRecords(page);

  try {
    const fixture = await createAnalysisFixtures(page, records);
    await page.goto('/#/analysis');
    await expect(page.getByRole('heading', { name: 'Data Analysis' })).toBeVisible();
    await page.getByPlaceholder('Select customer').fill(fixture.customer.code);
    await page.getByText(new RegExp(fixture.customer.code)).last().click();
    await page.getByPlaceholder('Select product').fill(fixture.product.product_model);
    await page.getByText(new RegExp(fixture.product.product_model)).last().click();
    await expect(page.getByText('Analysis Conditions', { exact: false })).toBeVisible();
    await expect(page.getByText(fixture.customer.short_name, { exact: true })).toBeVisible();
    await expect(page.getByText(fixture.product.product_model, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('row').filter({ hasText: fixture.product.product_model })
    ).toBeVisible();

    const normalDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Data', exact: true }).click();
    expect((await normalDownload).suggestedFilename()).toMatch(/\.xlsx$/i);

    await page.getByPlaceholder('Select customer').clear();
    await page.getByPlaceholder('Select product').clear();
    await page.getByRole('button', { name: 'Export Data', exact: true }).click();
    const advancedDialog = page.getByRole('dialog');
    await expect(
      advancedDialog.getByText('Advanced Export Options', { exact: true })
    ).toBeVisible();
    const groupedDownload = page.waitForEvent('download');
    await advancedDialog.getByRole('button', { name: 'Export by Customer', exact: true }).click();
    expect((await groupedDownload).suggestedFilename()).toMatch(/\.xlsx$/i);

    await page.getByRole('radio', { name: 'Purchase' }).click();
    await page.getByPlaceholder('Select Supplier').fill(fixture.supplier.code);
    await page.getByText(new RegExp(fixture.supplier.code)).last().click();
    await expect(page.getByText(fixture.supplier.short_name, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('row').filter({ hasText: fixture.product.product_model })
    ).toBeVisible();

    await page.getByPlaceholder('Select Supplier').clear();
    await page.getByRole('button', { name: 'Export Data', exact: true }).click();
    const supplierExport = page.getByRole('dialog');
    const purchaseDownload = page.waitForEvent('download');
    await supplierExport.getByRole('button', { name: 'Export by Supplier', exact: true }).click();
    expect((await purchaseDownload).suggestedFilename()).toMatch(/\.xlsx$/i);
  } finally {
    await records.cleanup();
  }
});

test('export page downloads every report category and handles empty or failed responses', async ({
  page
}) => {
  const records = new E2eRecords(page);

  try {
    const fixture = await createAnalysisFixtures(
      page,
      records,
      new Date().toISOString().slice(0, 10)
    );
    await page.goto('/#/export');
    await expect(page.getByRole('button', { name: 'Export All Base Info' })).toBeVisible();

    await expectExcelDownload(page, 'Export All Base Info');
    await expectExcelDownload(page, 'Export Only Partners');
    await expectExcelDownload(page, 'Export Only Products');
    await expectExcelDownload(page, 'Export Only Product Prices');
    await expectExcelDownload(page, 'Inventory Export');
    await expectExcelDownload(page, 'Export Inbound/Outbound Records');
    await expectExcelDownload(page, 'Export Only Inbound Records');
    await expectExcelDownload(page, 'Export Only Outbound Records');
    await expectExcelDownload(page, 'Export Statement');
    await expectExcelDownload(page, 'Inbound Statement');
    await expectExcelDownload(page, 'Outbound Statement');
    await expectExcelDownload(page, 'Export Receivable/Payable Details');

    await page.getByPlaceholder('Required').fill(fixture.customer.code);
    await expectExcelDownload(page, 'Export Invoice Details');

    await page.route('**/api/export/inventory', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        body: ''
      })
    );
    await page.getByRole('button', { name: 'Inventory Export' }).click();
    await expect(page.getByText('Exported file is empty, check filter or data.')).toBeVisible();
    await page.unroute('**/api/export/inventory');

    await page.route('**/api/export/inventory', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"failed"}' })
    );
    await page.getByRole('button', { name: 'Inventory Export' }).click();
    await expect(page.getByText(/Export failed/)).toBeVisible();
  } finally {
    await records.cleanup();
  }
});
