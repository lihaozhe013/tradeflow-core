import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  apiRequest,
  expectDesktopOrNarrowLayout,
  type E2eRecords,
  logInAs,
  paginationButton,
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

async function createStockFixtures(
  page: Page,
  records: E2eRecords
): Promise<{
  supplier: PartnerFixture;
  customer: PartnerFixture;
  product: ProductFixture;
}> {
  const suffix = uniqueId('E2E-STOCK');
  const supplier = {
    code: `${suffix}-SUP`,
    short_name: `${suffix} Supplier`,
    full_name: `${suffix} Supplier Ltd.`,
    type: 0
  };
  const customer = {
    code: `${suffix}-CUS`,
    short_name: `${suffix} Customer`,
    full_name: `${suffix} Customer Ltd.`,
    type: 1
  };
  const product = {
    code: `${suffix}-PRD`,
    product_model: `${suffix}-MODEL`,
    category: 'Raw Materials'
  };

  await records.create(
    '/partners',
    supplier,
    `/partners/${encodeURIComponent(supplier.short_name)}`
  );
  await records.create(
    '/partners',
    customer,
    `/partners/${encodeURIComponent(customer.short_name)}`
  );
  await records.create('/products', product, `/products/${encodeURIComponent(product.code)}`);
  return { supplier, customer, product };
}

async function createInboundFromUi(
  page: Page,
  records: E2eRecords,
  fixture: { supplier: PartnerFixture; product: ProductFixture },
  orderNumber: string,
  quantity: number
): Promise<number> {
  await page.goto('/#/inbound');
  await page.getByRole('button', { name: 'Add Inbound Record' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Supplier Code').fill(fixture.supplier.code);
  await dialog.getByLabel('Supplier Short Name').fill(fixture.supplier.short_name);
  await dialog.getByLabel('Product Code').fill(fixture.product.code);
  await dialog.getByLabel('Quantity').fill(String(quantity));
  await dialog.getByText('Manual Input', { exact: true }).click();
  await dialog.getByPlaceholder('Enter unit price').fill('2');
  await dialog.getByPlaceholder('Enter order number').fill(orderNumber);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().replace(/\/$/, '').endsWith('/api/inbound') &&
      response.request().method() === 'POST'
  );
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const created = (await response.json()) as CreatedRecord;
  records.track(`/inbound/${created.id}`);
  await expect(dialog).toBeHidden();
  return created.id;
}

async function createOutboundFromUi(
  page: Page,
  records: E2eRecords,
  fixture: { customer: PartnerFixture; product: ProductFixture },
  orderNumber: string,
  quantity: number
): Promise<number> {
  await page.goto('/#/outbound');
  await page.getByRole('button', { name: 'Add Outbound Record' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Customer Code').fill(fixture.customer.code);
  await dialog.getByLabel('Customer Short Name').fill(fixture.customer.short_name);
  await dialog.getByLabel('Product Code').fill(fixture.product.code);
  await dialog.getByLabel('Quantity').fill(String(quantity));
  await dialog.getByText('Manual Input', { exact: true }).click();
  await dialog.getByPlaceholder('Enter unit price').fill('3');
  await dialog.getByPlaceholder('Enter order number').fill(orderNumber);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().replace(/\/$/, '').endsWith('/api/outbound') &&
      response.request().method() === 'POST'
  );
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const created = (await response.json()) as CreatedRecord;
  records.track(`/outbound/${created.id}`);
  await expect(dialog).toBeHidden();
  return created.id;
}

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await logInAs(page, 'editor');
});

test('inbound supports create, search, validation, edit, batch update, and delete', async ({
  page,
  records
}) => {
  const firstOrder = uniqueId('E2E-IN-ORDER');
  const secondOrder = uniqueId('E2E-IN-ORDER');

  try {
    const fixture = await createStockFixtures(page, records);
    await page.goto('/#/inbound');
    await page.getByRole('button', { name: 'Add Inbound Record' }).click();
    const emptyDialog = page.getByRole('dialog');
    await emptyDialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(
      emptyDialog.locator('.ant-form-item-explain-error').getByText('Enter supplier code', {
        exact: true
      })
    ).toBeVisible();
    await emptyDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

    const firstInboundId = await createInboundFromUi(page, records, fixture, firstOrder, 8);
    await createInboundFromUi(page, records, fixture, secondOrder, 4);

    await page.getByRole('button', { name: 'Advanced Filters' }).click();
    await page.getByPlaceholder('Enter order number').first().fill(firstOrder);
    await page.getByPlaceholder('Enter order number').first().press('Enter');
    await page.getByRole('button', { name: /^search Filter$/ }).click();
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse' }).click();
    await page.getByRole('button', { name: 'Advanced Filters' }).click();
    await page.getByPlaceholder('Enter order number').first().clear();
    await page.getByRole('button', { name: /^search Filter$/ }).click();
    await page.getByRole('button', { name: 'Collapse' }).click();

    await page.getByPlaceholder('Search order / invoice / receipt number').fill(firstOrder);
    await page.getByPlaceholder('Search order / invoice / receipt number').press('Enter');
    let row = page.getByRole('row').filter({ hasText: firstOrder });
    await expect(row).toContainText('8');
    await expect(page.getByRole('row').filter({ hasText: secondOrder })).toHaveCount(0);

    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog');
    await editDialog.getByLabel('Quantity').fill('10');
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/inbound/') && response.request().method() === 'PUT'
    );
    await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    row = page.getByRole('row').filter({ hasText: firstOrder });
    await expect(row).toContainText('10');
    await expect(row).toContainText('$20');

    const sortRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/inbound?') && request.url().includes('sort_field=unit_price')
    );
    await page.getByRole('columnheader', { name: 'Unit Price' }).click();
    expect((await sortRequest).url()).toContain('sort_field=unit_price');

    await page.getByPlaceholder('Search order / invoice / receipt number').fill('E2E-IN-ORDER');
    await page.getByPlaceholder('Search order / invoice / receipt number').press('Enter');
    const firstRow = page.getByRole('row').filter({ hasText: firstOrder });
    const secondRow = page.getByRole('row').filter({ hasText: secondOrder });
    await firstRow.getByRole('checkbox').check();
    await secondRow.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Batch Edit' }).click();
    const batchDialog = page.getByRole('dialog');
    const batchInvoice = uniqueId('E2E-BATCH-INVOICE');
    await batchDialog.getByPlaceholder('Enter invoice number').fill(batchInvoice);
    const batchResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/inbound/batch') && response.request().method() === 'POST'
    );
    await batchDialog.getByRole('button', { name: 'Batch Update 2 Records' }).click();
    expect((await batchResponse).ok()).toBeTruthy();
    const firstUpdatedRow = page.getByRole('row').filter({ hasText: firstOrder });
    await firstUpdatedRow.getByRole('button', { name: 'Expand row' }).click();
    await expect(page.getByText(batchInvoice, { exact: true })).toBeVisible();
    const secondUpdatedRow = page.getByRole('row').filter({ hasText: secondOrder });
    await secondUpdatedRow.getByRole('button', { name: 'Expand row' }).click();
    await expect(page.getByText(batchInvoice, { exact: true }).last()).toBeVisible();

    await firstUpdatedRow.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    records.forget(`/inbound/${firstInboundId}`);
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toHaveCount(0);
  } finally {
    await records.cleanup();
  }
});

test('outbound supports inventory validation, create, search, edit, batch update, and delete', async ({
  page,
  records
}) => {
  const firstOrder = uniqueId('E2E-OUT-ORDER');
  const secondOrder = uniqueId('E2E-OUT-ORDER');

  try {
    const fixture = await createStockFixtures(page, records);
    const inbound = await apiRequest<CreatedRecord>(page, 'POST', '/inbound', {
      supplier_code: fixture.supplier.code,
      product_code: fixture.product.code,
      quantity: 30,
      unit_price: 2,
      inbound_date: new Date().toISOString().slice(0, 10),
      order_number: uniqueId('E2E-STOCK-SEED')
    });
    records.track(`/inbound/${inbound.id}`);
    await page.goto('/#/outbound');
    await page.getByRole('button', { name: 'Add Outbound Record' }).click();
    const validationDialog = page.getByRole('dialog');
    await validationDialog.getByLabel('Customer Code').fill(fixture.customer.code);
    await validationDialog.getByLabel('Customer Short Name').fill(fixture.customer.short_name);
    await validationDialog.getByLabel('Product Code').fill(fixture.product.code);
    await validationDialog.getByLabel('Quantity').fill('31');
    await validationDialog.getByText('Manual Input', { exact: true }).click();
    await validationDialog.getByPlaceholder('Enter unit price').fill('3');
    const oversellResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/outbound') && response.request().method() === 'POST'
    );
    await validationDialog.getByRole('button', { name: 'Add', exact: true }).click();
    const oversell = await oversellResponse;
    expect(oversell.ok()).toBeTruthy();
    const oversellRecord = (await oversell.json()) as CreatedRecord;
    records.track(`/outbound/${oversellRecord.id}`);
    await expect(validationDialog).toBeHidden();

    await page.goto('/#/inventory');
    await page.getByPlaceholder('Search Product Model').fill(fixture.product.product_model);
    const overdrawInventoryRow = page.getByRole('row').filter({
      hasText: fixture.product.product_model
    });
    await expect(overdrawInventoryRow).toContainText('-1');

    const firstOutboundId = await createOutboundFromUi(page, records, fixture, firstOrder, 5);
    await createOutboundFromUi(page, records, fixture, secondOrder, 4);
    await page.getByRole('button', { name: 'Advanced Filters' }).click();
    await page.getByPlaceholder('Enter order number').first().fill(firstOrder);
    await page.getByPlaceholder('Enter order number').first().press('Enter');
    await page.getByRole('button', { name: /^search Filter$/ }).click();
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse' }).click();
    await page.getByRole('button', { name: 'Advanced Filters' }).click();
    await page.getByPlaceholder('Enter order number').first().clear();
    await page.getByRole('button', { name: /^search Filter$/ }).click();
    await page.getByRole('button', { name: 'Collapse' }).click();

    await page.getByPlaceholder('Search order / invoice / receipt number').fill(firstOrder);
    await page.getByPlaceholder('Search order / invoice / receipt number').press('Enter');
    let row = page.getByRole('row').filter({ hasText: firstOrder });
    await expect(row).toContainText('5');

    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog');
    await editDialog.getByLabel('Quantity').fill('7');
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/outbound/') && response.request().method() === 'PUT'
    );
    await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    row = page.getByRole('row').filter({ hasText: firstOrder });
    await expect(row).toContainText('7');
    await expect(row).toContainText('$21');

    const sortRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/outbound?') && request.url().includes('sort_field=unit_price')
    );
    await page.getByRole('columnheader', { name: 'Unit Price' }).click();
    expect((await sortRequest).url()).toContain('sort_field=unit_price');

    await page.getByPlaceholder('Search order / invoice / receipt number').fill('E2E-OUT-ORDER');
    await page.getByPlaceholder('Search order / invoice / receipt number').press('Enter');
    await page.getByRole('row').filter({ hasText: firstOrder }).getByRole('checkbox').check();
    await page.getByRole('row').filter({ hasText: secondOrder }).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Batch Edit' }).click();
    const batchDialog = page.getByRole('dialog');
    const batchReceipt = uniqueId('E2E-BATCH-RECEIPT');
    await batchDialog.getByPlaceholder('Enter Receipt Number').fill(batchReceipt);
    const batchResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/outbound/batch') && response.request().method() === 'POST'
    );
    await batchDialog.getByRole('button', { name: 'Batch Update 2 Records' }).click();
    expect((await batchResponse).ok()).toBeTruthy();
    const firstUpdatedRow = page.getByRole('row').filter({ hasText: firstOrder });
    await firstUpdatedRow.getByRole('button', { name: 'Expand row' }).click();
    await expect(page.getByText(batchReceipt, { exact: true })).toBeVisible();
    const secondUpdatedRow = page.getByRole('row').filter({ hasText: secondOrder });
    await secondUpdatedRow.getByRole('button', { name: 'Expand row' }).click();
    await expect(page.getByText(batchReceipt, { exact: true }).last()).toBeVisible();

    await page
      .getByRole('row')
      .filter({ hasText: firstOrder })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    records.forget(`/outbound/${firstOutboundId}`);
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toHaveCount(0);

    await page.goto('/#/inventory');
    await page.getByPlaceholder('Search Product Model').fill(fixture.product.product_model);
    const inventoryRow = page.getByRole('row').filter({ hasText: fixture.product.product_model });
    await expect(inventoryRow).toContainText('-5');
  } finally {
    await records.cleanup();
  }
});

test('inventory filters, sorts, paginates, and recalculates through the UI', async ({
  page,
  records
}) => {
  const suffix = uniqueId('E2E-INVENTORY');
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

  try {
    await records.create(
      '/partners',
      supplier,
      `/partners/${encodeURIComponent(supplier.short_name)}`
    );
    await records.create('/products', product, `/products/${encodeURIComponent(product.code)}`);
    const inbound = await apiRequest<CreatedRecord>(page, 'POST', '/inbound', {
      supplier_code: supplier.code,
      product_code: product.code,
      quantity: 11,
      unit_price: 4,
      inbound_date: new Date().toISOString().slice(0, 10)
    });
    records.track(`/inbound/${inbound.id}`);

    await page.goto('/#/inventory');
    await page.getByPlaceholder('Search Product Model').fill(product.product_model);
    let row = page.getByRole('row').filter({ hasText: product.product_model });
    await expect(row).toContainText('11');
    await expect(row).toContainText('Normal');

    await page.getByRole('button', { name: 'Recalculate' }).click();
    await expect(page.getByText('Inventory Recalculated', { exact: true })).toBeVisible();
    await expect(row).toContainText('11');

    await page.getByPlaceholder('Search Product Model').fill('missing-inventory-e2e');
    await expect(page.getByRole('row').filter({ hasText: 'missing-inventory-e2e' })).toHaveCount(0);
    await page.getByPlaceholder('Search Product Model').clear();
    await page.getByRole('columnheader', { name: 'Product Model' }).click();
    await expect(page.getByRole('row').nth(1)).toBeVisible();
    await expect(paginationButton(page, 'Next')).toBeEnabled();
    await paginationButton(page, 'Next').click();
    await expect(paginationButton(page, 'Previous')).toBeEnabled();
  } finally {
    await records.cleanup();
  }
});

test('overview refreshes analytics, opens stock details, and exposes quick stock routes', async ({
  page
}) => {
  await page.goto('/#/overview');
  await expect(page.getByText('Total Sales', { exact: true })).toBeVisible();
  const monthlyCard = page.locator('.ant-card').filter({ hasText: 'Monthly Inventory Change' });
  const refreshResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/overview/stats') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Refresh Analytics' }).click();
  expect((await refreshResponse).ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Refresh Analytics' })).toBeEnabled();
  await expect(monthlyCard.getByText('Current Inventory', { exact: true })).toBeVisible();
  await monthlyCard.getByRole('combobox').click();
  await page.locator('.ant-select-item-option').nth(1).click();
  await expect(monthlyCard.getByText('Monthly Change', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Details' }).click();
  const outOfStockDialog = page.getByRole('dialog');
  await expect(outOfStockDialog).toBeVisible();
  await outOfStockDialog.locator('button.ant-modal-close').click();

  await page.getByRole('button', { name: 'Quick Inbound' }).click();
  await expect(page).toHaveURL(/#\/inbound$/);
  await page.goto('/#/overview');
  await page.getByRole('button', { name: 'Quick Outbound' }).click();
  await expect(page).toHaveURL(/#\/outbound$/);
});

test('overview isolates a failed top-sales chart request', async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/api/overview/top-sales-products')) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    }
    return route.continue();
  });
  await page.goto('/#/overview');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  const failedChartRequest = page.waitForResponse(
    (response) =>
      response.url().includes('/api/overview/top-sales-products') && response.status() === 503
  );
  await page.getByRole('button', { name: 'Refresh Analytics' }).click();
  await failedChartRequest;
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.locator('.ant-alert-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quick Inbound' })).toBeVisible();
});

test.describe('mobile inbound records', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('supports search, edit, batch update, and delete from record cards', async ({
    page,
    records
  }) => {
    const firstOrder = uniqueId('E2E-MOBILE-IN-ORDER');
    const secondOrder = uniqueId('E2E-MOBILE-IN-ORDER');

    try {
      const fixture = await createStockFixtures(page, records);
      const firstInboundId = await createInboundFromUi(page, records, fixture, firstOrder, 8);
      await createInboundFromUi(page, records, fixture, secondOrder, 4);

      await page.getByPlaceholder('Search order / invoice / receipt number').fill('E2E-MOBILE-IN-ORDER');
      await page.getByPlaceholder('Search order / invoice / receipt number').press('Enter');
      const recordsList = page.locator('.responsive-record-cards');
      await expect(recordsList.locator('.responsive-record-card')).toHaveCount(2);

      let firstCard = recordsList.locator('.responsive-record-card').filter({ hasText: firstOrder });
      await expect(firstCard).toContainText('8');
      await firstCard.getByRole('button', { name: 'Edit' }).click();
      const editDialog = page.getByRole('dialog');
      await editDialog.getByLabel('Quantity').fill('10');
      const updateResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/inbound/') && response.request().method() === 'PUT'
      );
      await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
      expect((await updateResponse).ok()).toBeTruthy();
      firstCard = recordsList.locator('.responsive-record-card').filter({ hasText: firstOrder });
      await expect(firstCard).toContainText('10');

      const invoiceNumber = uniqueId('E2E-MOBILE-BATCH-INVOICE');
      for (const card of [firstCard, recordsList.locator('.responsive-record-card').filter({ hasText: secondOrder })]) {
        await card.getByRole('checkbox').check();
      }
      await page.getByRole('button', { name: /Batch Edit/ }).click();
      const batchDialog = page.getByRole('dialog');
      await batchDialog.getByPlaceholder('Enter invoice number').fill(invoiceNumber);
      const batchResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/inbound/batch') && response.request().method() === 'POST'
      );
      await batchDialog.getByRole('button', { name: 'Batch Update 2 Records' }).click();
      expect((await batchResponse).ok()).toBeTruthy();

      firstCard = recordsList.locator('.responsive-record-card').filter({ hasText: firstOrder });
      await firstCard.locator('details summary').click();
      await expect(firstCard).toContainText(invoiceNumber);
      await firstCard.getByRole('button', { name: 'Delete' }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      records.forget(`/inbound/${firstInboundId}`);
      await expect(recordsList.locator('.responsive-record-card').filter({ hasText: firstOrder })).toHaveCount(0);
    } finally {
      await records.cleanup();
    }
  });
});

test('captures the target responsive widths without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await logInAs(page, 'editor');

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
    { width: 1366, height: 768 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/inventory');
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await expectDesktopOrNarrowLayout(page);
    if (viewport.width < 768) {
      const navigationButton = page.getByRole('button', { name: 'Open navigation' });
      const buttonBounds = await navigationButton.boundingBox();
      expect(buttonBounds?.width).toBeGreaterThanOrEqual(40);
      expect(buttonBounds?.height).toBeGreaterThanOrEqual(40);
    }
    await page.screenshot({ path: testInfo.outputPath(`responsive-${viewport.width}.png`) });
  }
});

test('mobile inventory cards support sorting and pagination', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logInAs(page, 'editor');
  await page.goto('/#/inventory');

  const sortControl = page.getByRole('combobox', { name: 'Sort records' });
  await sortControl.click();
  await page.getByText('Product Model ↑', { exact: true }).click();
  await expect(sortControl).toBeVisible();

  const nextPage = page.getByRole('listitem', { name: 'Next Page' }).getByRole('button');
  await expect(nextPage).toBeEnabled();
  await nextPage.click();
  await expect(page.locator('.responsive-record-pagination')).toContainText('21-40 of');
});
