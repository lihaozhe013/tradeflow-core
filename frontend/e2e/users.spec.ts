import { expect, test } from './fixtures';
import { logInAs, paginationButton, uniqueId, useEnglish } from './support';

test.beforeEach(async ({ page }) => useEnglish(page));

test('user administration creates, edits, disables, resets, authenticates, and deletes users', async ({
  page,
  records
}) => {
  await logInAs(page, 'superuser');
  const username = uniqueId('e2e_user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const initialPassword = 'initial-pass-123';
  const resetPassword = 'reset-pass-456';

  try {
    await page.goto('/#/users');
    await expect(page.getByText('User List', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create User' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Username').fill(username);
    await dialog.getByLabel('Display Name').fill(`${username} Display`);
    await dialog.getByLabel('New Password').fill(initialPassword);
    await dialog.getByLabel('Confirm Password').fill('mismatched-password');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText('Passwords do not match', { exact: true })).toBeVisible();
    await dialog.getByLabel('Confirm Password').fill(initialPassword);
    await dialog.getByRole('combobox').click();
    await page.getByText('Reader', { exact: true }).last().click();
    const createResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/users') && response.request().method() === 'POST'
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect((await createResponse).ok()).toBeTruthy();
    records.track(`/users/${encodeURIComponent(username)}`);

    let row = page.getByRole('row').filter({ hasText: username });
    await expect(row).toContainText('reader');
    await row.getByRole('button', { name: 'Edit' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').click();
    await page.getByText('Editor', { exact: true }).last().click();
    await dialog.getByRole('switch').click();
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/users/${username}`) && response.request().method() === 'PUT'
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    row = page.getByRole('row').filter({ hasText: username });
    await expect(row).toContainText('editor');
    await expect(row).toContainText('No');

    await row.getByRole('button', { name: 'Edit' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('switch').click();
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    row = page.getByRole('row').filter({ hasText: username });
    await expect(row).toContainText('Yes');

    await row.getByRole('button', { name: 'Reset Password' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Enter new password').fill(resetPassword);
    const resetResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/users/${username}/reset-password`) &&
        response.request().method() === 'PUT'
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect((await resetResponse).ok()).toBeTruthy();

    await page.getByRole('button', { name: /Test superuser/i }).click();
    await page.getByText('Log Out', { exact: true }).click();
    await expect(page).toHaveURL(/#\/login$/);
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill(resetPassword);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByRole('button', { name: new RegExp(username, 'i') })).toBeVisible();

    await logInAs(page, 'superuser');
    await page.goto('/#/users');
    row = page.getByRole('row').filter({ hasText: username });
    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Yes' }).click();
    records.forget(`/users/${encodeURIComponent(username)}`);
    await expect(page.getByRole('row').filter({ hasText: username })).toHaveCount(0);
  } finally {
    await records.cleanup();
  }
});

test('profile and password self-service validate inputs and persist changes', async ({
  page,
  records
}) => {
  await logInAs(page, 'superuser');
  const username = uniqueId('e2e_profile')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const initialPassword = 'profile-pass-123';
  const updatedPassword = 'profile-pass-456';

  await records.create(
    '/users',
    {
      username,
      password: initialPassword,
      display_name: `${username} Display`,
      role: 'editor',
      enabled: true
    },
    `/users/${encodeURIComponent(username)}`
  );

  try {
    await page.goto('/#/login');
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill(initialPassword);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByRole('button', { name: new RegExp(username, 'i') })).toBeVisible();
    await page.goto('/#/users');
    await expect(page.getByText('My Profile', { exact: true })).toBeVisible();
    const displayNameInput = page.getByLabel('Display Name');
    const updatedName = uniqueId('E2E Name');
    await displayNameInput.fill(updatedName);
    const profileResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/users/me') && response.request().method() === 'PUT'
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await profileResponse).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByLabel('Display Name')).toHaveValue(updatedName);

    await page.getByLabel('Old Password').fill('wrong-password');
    await page.getByLabel('New Password').fill('short');
    await page.getByLabel('Confirm Password').fill('different');
    await page.getByRole('button', { name: 'Change Password', exact: true }).click();
    await expect(page.getByText('Passwords do not match', { exact: true })).toBeVisible();

    await page.getByLabel('Confirm Password').fill('short');
    await page.getByRole('button', { name: 'Change Password', exact: true }).click();
    await expect(
      page.getByText('Password must be at least 6 characters', { exact: true })
    ).toBeVisible();

    await page.getByLabel('Old Password').fill(initialPassword);
    await page.getByLabel('New Password').fill(updatedPassword);
    await page.getByLabel('Confirm Password').fill(updatedPassword);
    const passwordResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/users/me/password') && response.request().method() === 'PUT'
    );
    await page.getByRole('button', { name: 'Change Password', exact: true }).click();
    expect((await passwordResponse).ok()).toBeTruthy();

    await page.getByRole('button', { name: new RegExp(updatedName, 'i') }).click();
    await page.getByText('Log Out', { exact: true }).click();
    await expect(page).toHaveURL(/#\/login$/);
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill(updatedPassword);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByRole('button', { name: new RegExp(updatedName, 'i') })).toBeVisible();
    await page.goto('/#/users');
    await expect(page.getByLabel('Display Name')).toHaveValue(updatedName);
  } finally {
    await records.cleanup();
  }
});

test('user list pagination changes pages and page sizes', async ({ page, records }) => {
  await logInAs(page, 'superuser');
  const prefix = uniqueId('e2e_page_user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');

  try {
    for (let index = 0; index < 7; index += 1) {
      const username = `${prefix}_${index}`;
      await records.create(
        '/users',
        {
          username,
          password: 'page-user-pass',
          display_name: username,
          role: 'reader',
          enabled: true
        },
        `/users/${encodeURIComponent(username)}`
      );
    }

    await page.goto('/#/users');
    await expect(page.getByText(prefix, { exact: false }).first()).toBeVisible();
    await paginationButton(page, 'Next').click();
    await expect(paginationButton(page, 'Previous')).toBeEnabled();
    await page.getByLabel('Page Size').click();
    await page.getByText('50 / page', { exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: prefix })).toHaveCount(7);
  } finally {
    await records.cleanup();
  }
});
