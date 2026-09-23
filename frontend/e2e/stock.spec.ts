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
  page
}) => {
  const records = new E2eRecords(page);
  const firstOrder = uniqueId('E2E-IN-ORDER');
  const secondOrder = uniqueId('E2E-IN-ORDER');

  try {
    const fixture = await createStockFixtures(page, records);
    await page.goto('/#/inbound');
    await page.getByRole('button', { name: 'Add Inbound Record' }).click();
    const emptyDialog = page.getByRole('dialog');
    await emptyDialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(emptyDialog.getByText('Enter supplier code', { exact: true })).toBeVisible();
    await emptyDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

    await createInboundFromUi(page, records, fixture, firstOrder, 8);
    await createInboundFromUi(page, records, fixture, secondOrder, 4);

    await page.getByRole('button', { name: 'Advanced Filters' }).click();
    await page.getByPlaceholder('Enter order number').fill(firstOrder);
    await page.getByPlaceholder('Enter order number').press('Enter');
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse', exact: true }).click();
    await page.getByRole('button', { name: 'Filter', exact: true }).click();

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

    await page.getByPlaceholder('Search order / invoice / receipt number').clear();
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
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toContainText(batchInvoice);
    await expect(page.getByRole('row').filter({ hasText: secondOrder })).toContainText(
      batchInvoice
    );

    const firstUpdatedRow = page.getByRole('row').filter({ hasText: firstOrder });
    await firstUpdatedRow.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toHaveCount(0);
  } finally {
    await records.cleanup();
  }
});

test('outbound supports inventory validation, create, search, edit, batch update, and delete', async ({
  page
}) => {
  const records = new E2eRecords(page);
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
    await validationDialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(validationDialog).toBeVisible();
    await validationDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

    await createOutboundFromUi(page, records, fixture, firstOrder, 5);
    await createOutboundFromUi(page, records, fixture, secondOrder, 4);
    await page.getByRole('button', { name: 'Advanced Filters' }).click();
    await page.getByPlaceholder('Enter order number').fill(firstOrder);
    await page.getByPlaceholder('Enter order number').press('Enter');
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse', exact: true }).click();
    await page.getByRole('button', { name: 'Filter', exact: true }).click();

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

    await page.getByPlaceholder('Search order / invoice / receipt number').clear();
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
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toContainText(batchReceipt);
    await expect(page.getByRole('row').filter({ hasText: secondOrder })).toContainText(
      batchReceipt
    );

    await page
      .getByRole('row')
      .filter({ hasText: firstOrder })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: firstOrder })).toHaveCount(0);

    await page.goto('/#/inventory');
    await page.getByPlaceholder('Search Product Model').fill(fixture.product.product_model);
    const inventoryRow = page.getByRole('row').filter({ hasText: fixture.product.product_model });
    await expect(inventoryRow).toContainText('19');
  } finally {
    await records.cleanup();
  }
});

test('inventory filters, sorts, paginates, and recalculates through the UI', async ({ page }) => {
  const records = new E2eRecords(page);
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
    await expect(page.getByRole('button', { name: 'Next Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect(page.getByRole('button', { name: 'Previous Page' })).toBeEnabled();
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
  await expect(monthlyCard.getByText('Current Inventory', { exact: true })).toBeVisible();
  await monthlyCard.getByRole('combobox').click();
  await page.locator('.ant-select-item-option').nth(1).click();
  await expect(monthlyCard.getByText('Monthly Change', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Refresh Analytics' }).click();
  await expect(page.getByRole('button', { name: 'Refresh Analytics' })).toBeEnabled();
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
  await page.route('**/api/overview/top-sales-products', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
  );
  await page.goto('/#/overview');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quick Inbound' })).toBeVisible();
});
