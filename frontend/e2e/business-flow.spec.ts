import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import type { E2eRecords } from './support';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('tradeflow.language', 'en');
  });
});

async function logIn(page: Page): Promise<void> {
  await page.goto('/#/login');
  await page.getByPlaceholder('Username').fill('test_editor');
  await page.getByPlaceholder('Password').fill('testpass123');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

async function createdResponse(page: Page, endpoint: string): Promise<Record<string, unknown>> {
  const response = await page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return (
      url.pathname.replace(/\/$/, '') === `/api/${endpoint}` &&
      candidate.request().method() === 'POST'
    );
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Record<string, unknown>;
}

async function createPartner(
  page: Page,
  records: E2eRecords,
  values: { code: string; shortName: string; fullName: string; type: 'Supplier' | 'Customer' }
): Promise<void> {
  await page.goto('/#/partners');
  await page.getByRole('button', { name: 'Add Partner' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Enter code').fill(values.code);
  await dialog.getByPlaceholder('Enter short name').fill(values.shortName);
  await dialog.getByPlaceholder('Enter full name').fill(values.fullName);
  const typeSelect = dialog.getByRole('combobox');
  await typeSelect.click();
  await typeSelect.press(values.type === 'Supplier' ? 'Home' : 'End');
  await typeSelect.press('Enter');
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/partners' && response.request().method() === 'POST';
  });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  records.track(`/partners/${encodeURIComponent(values.shortName)}`);
  await expect(dialog).toBeHidden();
}

test('creates partners and a product, records inbound and outbound stock, and verifies inventory', async ({
  page,
  records
}) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const supplierCode = `E2E-SUP-${suffix}`;
  const supplierName = `E2E Supplier ${suffix}`;
  const customerCode = `E2E-CUS-${suffix}`;
  const customerName = `E2E Customer ${suffix}`;
  const productCode = `E2E-PRD-${suffix}`;
  const productModel = `E2E-MODEL-${suffix}`;

  await logIn(page);
  await createPartner(page, records, {
    code: supplierCode,
    shortName: supplierName,
    fullName: `${supplierName} Ltd.`,
    type: 'Supplier'
  });
  await createPartner(page, records, {
    code: customerCode,
    shortName: customerName,
    fullName: `${customerName} Ltd.`,
    type: 'Customer'
  });

  const token = await page.evaluate(() => window.localStorage.getItem('auth_token'));
  expect(token).toBeTruthy();
  const partnerResponse = await page.request.get('http://127.0.0.1:18080/api/partners', {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(partnerResponse.ok()).toBeTruthy();
  const partnerPayload = (await partnerResponse.json()) as {
    data: Array<{ code: string; short_name: string; type: number }>;
  };
  const seededSupplier = partnerPayload.data.find(
    (partner) => partner.type === 0 && !partner.short_name.startsWith('E2E ')
  );
  const seededCustomer = partnerPayload.data.find(
    (partner) => partner.type === 1 && !partner.short_name.startsWith('E2E ')
  );
  expect(seededSupplier).toBeTruthy();
  expect(seededCustomer).toBeTruthy();

  await page.goto('/#/products');
  await page.getByRole('button', { name: 'Add Product' }).click();
  const productDialog = page.getByRole('dialog');
  await productDialog.getByPlaceholder('Enter code').fill(productCode);
  await productDialog.getByPlaceholder('Enter product model').fill(productModel);
  const categorySelect = productDialog.getByRole('combobox');
  await categorySelect.click();
  await categorySelect.pressSequentially('Other');
  await categorySelect.press('Enter');
  const productResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/products' && response.request().method() === 'POST';
  });
  await productDialog.getByRole('button', { name: 'Add', exact: true }).click();
  const productResponseResult = await productResponse;
  expect(productResponseResult.ok()).toBeTruthy();
  records.track(`/products/${encodeURIComponent(productCode)}`);
  await expect(productDialog).toBeHidden();

  await page.goto('/#/inbound');
  await page.getByRole('button', { name: 'Add Inbound Record' }).click();
  const inboundDialog = page.getByRole('dialog');
  await inboundDialog.getByLabel('Supplier Code').fill(seededSupplier!.code);
  await inboundDialog.getByLabel('Supplier Short Name').fill(seededSupplier!.short_name);
  await inboundDialog.getByLabel('Product Code').fill(productCode);
  await inboundDialog.getByLabel('Quantity').fill('12');
  await inboundDialog.getByText('Manual Input', { exact: true }).click();
  await inboundDialog.getByPlaceholder('Enter unit price').fill('2');
  const inboundResponse = createdResponse(page, 'inbound');
  await inboundDialog.getByRole('button', { name: 'Add', exact: true }).click();
  const inbound = await inboundResponse;
  records.track(`/inbound/${Number(inbound.id)}`);
  await expect(inboundDialog).toBeHidden();

  await page.goto('/#/outbound');
  await page.getByRole('button', { name: 'Add Outbound Record' }).click();
  const outboundDialog = page.getByRole('dialog');
  await outboundDialog.getByLabel('Customer Code').fill(seededCustomer!.code);
  await outboundDialog.getByLabel('Customer Short Name').fill(seededCustomer!.short_name);
  await outboundDialog.getByLabel('Product Code').fill(productCode);
  await outboundDialog.getByLabel('Quantity').fill('5');
  await outboundDialog.getByText('Manual Input', { exact: true }).click();
  await outboundDialog.getByPlaceholder('Enter unit price').fill('3');
  const outboundResponse = createdResponse(page, 'outbound');
  await outboundDialog.getByRole('button', { name: 'Add', exact: true }).click();
  const outbound = await outboundResponse;
  records.track(`/outbound/${Number(outbound.id)}`);
  await expect(outboundDialog).toBeHidden();

  await page.goto('/#/inventory');
  await page.getByPlaceholder('Search product model').fill(productModel);
  const inventoryRow = page.getByRole('row').filter({ hasText: productModel });
  await expect(inventoryRow).toContainText('7');
});
