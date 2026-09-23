import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { apiRequest, E2eRecords, logInAs, uniqueId, useEnglish } from './support';

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

interface CreatedRecord {
  id: number;
}

async function paymentFixtures(
  page: Page,
  records: E2eRecords,
  direction: 'receivable' | 'payable'
): Promise<{
  customer: PartnerFixture;
  supplier: PartnerFixture;
  product: ProductFixture;
  invoiceNumber: string;
}> {
  const suffix = uniqueId(`E2E-${direction.toUpperCase()}`);
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

  const invoiceNumber = `${suffix}-INV`;
  const baseRecord = {
    product_code: product.code,
    quantity: 3,
    unit_price: 10,
    inbound_date: new Date().toISOString().slice(0, 10),
    outbound_date: new Date().toISOString().slice(0, 10),
    invoice_date: new Date().toISOString().slice(0, 10),
    invoice_number: invoiceNumber,
    order_number: `${suffix}-ORDER`
  };
  const inbound = await apiRequest<CreatedRecord>(page, 'POST', '/inbound', {
    ...baseRecord,
    supplier_code: supplier.code
  });
  records.track(`/inbound/${inbound.id}`);

  if (direction === 'receivable') {
    const outbound = await apiRequest<CreatedRecord>(page, 'POST', '/outbound', {
      ...baseRecord,
      customer_code: customer.code
    });
    records.track(`/outbound/${outbound.id}`);
  }

  return { customer, supplier, product, invoiceNumber };
}

async function fillPayment(page: Page, remark: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Enter payment amount').fill('12.5');
  await dialog.getByPlaceholder('Select payment date').click();
  await page.locator('.ant-picker-cell-today button').click();
  await dialog.getByPlaceholder('Select payment method').click();
  await page.getByText('cash', { exact: true }).last().click();
  await dialog.getByPlaceholder('Enter remark (optional)').fill(remark);
}

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await logInAs(page, 'editor');
});

test('receivables support filtering, payment create/edit/delete, details, and invoice view', async ({
  page
}) => {
  const records = new E2eRecords(page);
  const remark = uniqueId('E2E-RECEIPT');

  try {
    const fixture = await paymentFixtures(page, records, 'receivable');
    await page.goto('/#/receivable');
    await expect(page.getByRole('button', { name: 'Next Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect(page.getByRole('button', { name: 'Previous Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Previous Page' }).click();
    const sortRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/receivable?') &&
        request.url().includes('sort_field=total_receivable')
    );
    await page.getByRole('columnheader', { name: 'Total Receivable' }).click();
    expect((await sortRequest).url()).toContain('sort_field=total_receivable');

    await page.getByPlaceholder('Search Customer').fill(fixture.customer.short_name);
    await page.getByPlaceholder('Search Customer').press('Enter');
    let row = page.getByRole('row').filter({ hasText: fixture.customer.short_name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('$30.00');

    await row.getByRole('button', { name: 'Add Payment' }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add New Payment Record', { exact: true })).toBeVisible();
    await fillPayment(page, remark);
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/receivable/payments') &&
        response.request().method() === 'POST'
    );
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    const response = await createResponse;
    expect(response.ok()).toBeTruthy();
    const payment = (await response.json()) as CreatedRecord;
    records.track(`/receivable/payments/${payment.id}`);

    row = page.getByRole('row').filter({ hasText: fixture.customer.short_name });
    await expect(row).toContainText('$12.50');
    await row.getByRole('button', { name: 'Details' }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Customer Information', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Receivables Summary', { exact: true })).toBeVisible();
    let paymentRow = dialog.getByRole('row').filter({ hasText: remark });
    await expect(paymentRow).toContainText('$12.50');

    await paymentRow.getByRole('button', { name: 'Edit', exact: true }).click();
    const editDialog = page.getByRole('dialog').last();
    await expect(editDialog.getByText('Edit Payment Record', { exact: true })).toBeVisible();
    await editDialog.getByPlaceholder('Enter payment amount').fill('15');
    const updateResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes('/api/receivable/payments/') &&
        candidate.request().method() === 'PUT'
    );
    await editDialog.getByRole('button', { name: 'OK', exact: true }).click();
    expect((await updateResponse).ok()).toBeTruthy();

    await page
      .getByRole('row')
      .filter({ hasText: fixture.customer.short_name })
      .getByRole('button', { name: 'Details' })
      .click();
    dialog = page.getByRole('dialog');
    paymentRow = dialog.getByRole('row').filter({ hasText: remark });
    await expect(paymentRow).toContainText('$15.00');
    await paymentRow
      .locator('button')
      .filter({ has: page.locator('[aria-label="delete"]') })
      .click();
    await page.getByRole('button', { name: 'OK', exact: true }).last().click();
    await expect(dialog.getByRole('row').filter({ hasText: remark })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'View Invoiced Details' }).click();
    const invoiceDialog = page.getByRole('dialog').last();
    await expect(invoiceDialog.getByText('Invoiced Details', { exact: false })).toBeVisible();
    await expect(
      invoiceDialog.getByRole('row').filter({ hasText: fixture.invoiceNumber })
    ).toBeVisible();
    const refreshInvoiceResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes(`/api/receivable/invoices/refresh/${fixture.customer.code}`) &&
        candidate.request().method() === 'POST'
    );
    await invoiceDialog.getByRole('button', { name: 'Refresh Cache' }).click();
    expect((await refreshInvoiceResponse).ok()).toBeTruthy();
    await invoiceDialog.getByRole('button', { name: 'Close' }).click();
    await dialog.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Data refreshed', { exact: true })).toBeVisible();
  } finally {
    await records.cleanup();
  }
});

test('payables support payment, supplier details, invoice listing, refresh, and search', async ({
  page
}) => {
  const records = new E2eRecords(page);
  const remark = uniqueId('E2E-PAYMENT');

  try {
    const fixture = await paymentFixtures(page, records, 'payable');
    await page.goto('/#/payable');
    await expect(page.getByRole('button', { name: 'Next Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect(page.getByRole('button', { name: 'Previous Page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Previous Page' }).click();
    const sortRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/payable?') &&
        request.url().includes('sort_field=total_payable')
    );
    await page.getByRole('columnheader', { name: 'Total Payable' }).click();
    expect((await sortRequest).url()).toContain('sort_field=total_payable');

    await page.getByPlaceholder('Search Supplier Short Name').fill(fixture.supplier.short_name);
    await page.getByPlaceholder('Search Supplier Short Name').press('Enter');
    const row = page.getByRole('row').filter({ hasText: fixture.supplier.short_name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('$30.00');
    await row.getByRole('button', { name: 'Details' }).click();
    const details = page.getByRole('dialog').first();
    await expect(details.getByText('Supplier Info', { exact: true })).toBeVisible();
    await expect(details.getByText('Summary', { exact: true })).toBeVisible();
    await details.getByRole('button', { name: 'View Invoiced Details' }).click();
    const invoiceDialog = page.getByRole('dialog').last();
    await expect(invoiceDialog.getByRole('columnheader', { name: 'Invoice Number' })).toBeVisible();
    await expect(
      invoiceDialog.getByRole('row').filter({ hasText: fixture.invoiceNumber })
    ).toBeVisible();
    const refreshInvoiceResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes(`/api/payable/invoices/refresh/${fixture.supplier.code}`) &&
        candidate.request().method() === 'POST'
    );
    await invoiceDialog.getByRole('button', { name: 'Refresh Cache' }).click();
    expect((await refreshInvoiceResponse).ok()).toBeTruthy();
    await invoiceDialog.getByRole('button', { name: 'Close' }).click();
    await details.getByRole('button', { name: 'Add Payment' }).click();
    await fillPayment(page, remark);
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/payable/payments') && response.request().method() === 'POST'
    );
    await page.getByRole('dialog').last().getByRole('button', { name: 'OK', exact: true }).click();
    const response = await createResponse;
    expect(response.ok()).toBeTruthy();
    const payment = (await response.json()) as CreatedRecord;
    records.track(`/payable/payments/${payment.id}`);

    await page
      .getByRole('row')
      .filter({ hasText: fixture.supplier.short_name })
      .getByRole('button', { name: 'Details' })
      .click();
    const refreshedDetails = page.getByRole('dialog').first();
    const paymentRow = refreshedDetails.getByRole('row').filter({ hasText: remark });
    await expect(paymentRow).toContainText('$12.50');
    await paymentRow.getByRole('button', { name: 'Edit', exact: true }).click();
    const editDialog = page.getByRole('dialog').last();
    await editDialog.getByPlaceholder('Enter payment amount').fill('15');
    const updateResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes('/api/payable/payments/') && candidate.request().method() === 'PUT'
    );
    await editDialog.getByRole('button', { name: 'OK', exact: true }).click();
    expect((await updateResponse).ok()).toBeTruthy();

    await page
      .getByRole('row')
      .filter({ hasText: fixture.supplier.short_name })
      .getByRole('button', { name: 'Details' })
      .click();
    const finalDetails = page.getByRole('dialog').first();
    const updatedPaymentRow = finalDetails.getByRole('row').filter({ hasText: remark });
    await expect(updatedPaymentRow).toContainText('$15.00');
    await updatedPaymentRow
      .locator('button')
      .filter({ has: page.locator('[aria-label="delete"]') })
      .click();
    await page.getByRole('button', { name: 'OK', exact: true }).last().click();
    await expect(finalDetails.getByRole('row').filter({ hasText: remark })).toHaveCount(0);
    await finalDetails.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Data refreshed', { exact: true })).toBeVisible();
  } finally {
    await records.cleanup();
  }
});
