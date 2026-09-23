import { expect, test } from '@playwright/test';
import { apiRequest, E2eRecords, logInAs, uniqueId, useEnglish } from './support';

interface CreatedRecord {
  id: number;
}

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await logInAs(page, 'editor');
});

test('partners support validation, creation, filtering, editing, and deletion', async ({
  page
}) => {
  const records = new E2eRecords(page);
  const suffix = uniqueId('E2E-PARTNER');
  const shortName = `${suffix} Supplier`;
  const fullName = `${shortName} Ltd.`;

  try {
    await page.goto('/#/partners');
    await expect(page.getByRole('button', { name: 'Next Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect(page.getByRole('button', { name: 'Previous Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Previous Page' }).click();
    await page.getByRole('button', { name: 'Add Partner' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog.getByText('Enter short name', { exact: true })).toBeVisible();

    await dialog.getByPlaceholder('Enter code').fill(suffix);
    await dialog.getByPlaceholder('Enter short name').fill(shortName);
    await dialog.getByPlaceholder('Enter full name').fill(fullName);
    await dialog.getByRole('combobox').click();
    await page.getByText('Supplier', { exact: true }).last().click();
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/partners') && response.request().method() === 'POST'
    );
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    expect((await createResponse).ok()).toBeTruthy();
    records.track(`/partners/${encodeURIComponent(shortName)}`);

    await page.getByPlaceholder('Enter code').fill(suffix);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    let row = page.getByRole('row').filter({ hasText: shortName });
    await expect(row).toContainText(fullName);

    await page.getByPlaceholder('Enter code').clear();
    await page.getByPlaceholder('Enter short name').fill(shortName);
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Supplier', exact: true }).click();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    row = page.getByRole('row').filter({ hasText: shortName });
    await expect(row).toContainText('Supplier');

    await row.getByRole('button', { name: 'Edit' }).click();
    dialog = page.getByRole('dialog');
    const updatedName = `${fullName} Updated`;
    await dialog.getByPlaceholder('Enter full name').fill(updatedName);
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/partners/') && response.request().method() === 'PUT'
    );
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    row = page.getByRole('row').filter({ hasText: shortName });
    await expect(row).toContainText(updatedName);

    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: shortName })).toHaveCount(0);
  } finally {
    await records.cleanup();
  }
});

test('products support creation, category and code filtering, editing, and deletion', async ({
  page
}) => {
  const records = new E2eRecords(page);
  const code = uniqueId('E2E-PROD');
  const model = `${code}-MODEL`;

  try {
    await page.goto('/#/products');
    await expect(page.getByRole('button', { name: 'Next Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect(page.getByRole('button', { name: 'Previous Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Previous Page' }).click();
    await page.getByRole('button', { name: 'Add Product' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog.getByText('Enter code', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Enter product model', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Add Product' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Enter code').fill(code);
    await dialog.getByPlaceholder('Enter product model').fill(model);
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Other', exact: true }).click();
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/products') && response.request().method() === 'POST'
    );
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    expect((await createResponse).ok()).toBeTruthy();
    records.track(`/products/${encodeURIComponent(code)}`);

    await page.getByPlaceholder('Enter code').fill(code);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    let row = page.getByRole('row').filter({ hasText: model });
    await expect(row).toContainText('Other');

    await row.getByRole('button', { name: 'Edit' }).click();
    dialog = page.getByRole('dialog');
    const updatedModel = `${model}-UPDATED`;
    await dialog.getByPlaceholder('Enter product model').fill(updatedModel);
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/products/') && response.request().method() === 'PUT'
    );
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    row = page.getByRole('row').filter({ hasText: updatedModel });
    await expect(row).toBeVisible();

    await page.getByPlaceholder('Enter code').clear();
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Other', exact: true }).click();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: updatedModel })).toBeVisible();

    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: updatedModel })).toHaveCount(0);
  } finally {
    await records.cleanup();
  }
});

test('product prices support creation, filtering, editing, and deletion', async ({ page }) => {
  const records = new E2eRecords(page);
  const suffix = uniqueId('E2E-PRICE');
  const partner = {
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
      partner,
      `/partners/${encodeURIComponent(partner.short_name)}`
    );
    await records.create('/products', product, `/products/${encodeURIComponent(product.code)}`);
    await page.goto('/#/product-prices');
    await expect(page.getByRole('button', { name: 'Next Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect(page.getByRole('button', { name: 'Previous Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Previous Page' }).click();
    await page.getByRole('button', { name: 'Add Price' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog.getByText('Select partner', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Select product model', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Enter unit price', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Add Price' }).click();
    dialog = page.getByRole('dialog');

    const partnerCode = dialog.getByPlaceholder('Enter partner code');
    await partnerCode.fill(partner.code);
    await page.getByText(new RegExp(partner.code)).last().click();
    const productCode = dialog.getByPlaceholder('Enter product code');
    await productCode.fill(product.code);
    await page.getByText(new RegExp(product.code)).last().click();
    await dialog.getByPlaceholder('Enter unit price').fill('12.5');
    await dialog.getByPlaceholder('Select effective date').click();
    await page.locator('.ant-picker-cell-today button').click();
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/product-prices') && response.request().method() === 'POST'
    );
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    const response = await createResponse;
    expect(response.ok()).toBeTruthy();
    const created = (await response.json()) as { id?: number };
    if (created.id !== undefined) records.track(`/product-prices/${created.id}`);

    await page.getByPlaceholder('Select product model').click();
    await page.getByText(product.product_model, { exact: true }).last().click();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    let row = page.getByRole('row').filter({ hasText: product.product_model });
    await expect(row).toContainText('12.5');

    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog');
    await editDialog.getByPlaceholder('Enter unit price').fill('14.75');
    const updateResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes('/api/product-prices/') && candidate.request().method() === 'PUT'
    );
    await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    row = page.getByRole('row').filter({ hasText: product.product_model });
    await expect(row).toContainText('14.75');

    await page.getByPlaceholder('Select partner').click();
    await page.getByText(partner.short_name, { exact: true }).last().click();
    await page.getByPlaceholder('Select product model').click();
    await page.getByText(product.product_model, { exact: true }).last().click();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    row = page.getByRole('row').filter({ hasText: product.product_model });
    await expect(row).toContainText('14.75');

    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: product.product_model })).toHaveCount(0);
  } finally {
    await records.cleanup();
  }
});

test('shows empty results and recovers after a temporary list request failure', async ({
  page
}) => {
  await page.goto('/#/partners');
  await page.route('**/api/partners?*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Partners' })).toBeVisible();
  await page.unroute('**/api/partners?*');
  await page.getByPlaceholder('Enter short name').fill('no-match-e2e-record');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'no-match-e2e-record' })).toHaveCount(0);
});

test('reader can search master data but cannot create, edit, or delete it', async ({ page }) => {
  await page.goto('/#/login');
  await logInAs(page, 'reader');
  await page.goto('/#/products');
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Product' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
});

test('partner and product deletion stays blocked while stock records reference them', async ({
  page
}) => {
  const records = new E2eRecords(page);
  const suffix = uniqueId('E2E-REFERENCED');
  const supplier = {
    code: `${suffix}-SUP`,
    short_name: `${suffix} Supplier`,
    full_name: `${suffix} Supplier Ltd.`,
    type: 0
  };
  const product = {
    code: `${suffix}-PRD`,
    product_model: `${suffix}-MODEL`,
    category: 'Other'
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
      quantity: 2,
      unit_price: 5,
      inbound_date: new Date().toISOString().slice(0, 10)
    });
    records.track(`/inbound/${inbound.id}`);

    await page.goto('/#/partners');
    await page.getByPlaceholder('Enter short name').fill(supplier.short_name);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    let row = page.getByRole('row').filter({ hasText: supplier.short_name });
    await row.getByRole('button', { name: 'Delete' }).click();
    const partnerDeleteResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/partners/') && response.request().method() === 'DELETE'
    );
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect((await partnerDeleteResponse).ok()).toBeFalsy();
    await expect(row).toBeVisible();

    await page.goto('/#/products');
    await page.getByPlaceholder('Enter code').fill(product.code);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    row = page.getByRole('row').filter({ hasText: product.product_model });
    await row.getByRole('button', { name: 'Delete' }).click();
    const productDeleteResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/products/') && response.request().method() === 'DELETE'
    );
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect((await productDeleteResponse).ok()).toBeFalsy();
    await expect(row).toBeVisible();
  } finally {
    await records.cleanup();
  }
});
