import { expect, type Page } from '@playwright/test';

export const API_BASE_URL = 'http://127.0.0.1:18080/api';
export const TEST_PASSWORD = 'testpass123';

export type TestRole = 'reader' | 'editor' | 'superuser';

const usernames: Record<TestRole, string> = {
  reader: 'test_reader',
  editor: 'test_editor',
  superuser: 'test_superuser'
};

export async function useEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('tradeflow.language', 'en');
  });
}

export async function logInAs(page: Page, role: TestRole): Promise<void> {
  await page.goto('/#/login');
  await page.evaluate(() => window.localStorage.removeItem('auth_token'));
  await page.reload();
  await page.getByPlaceholder('Username').fill(usernames[role]);
  await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Test ${role}`, 'i') })).toBeVisible();
}

export async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => window.localStorage.getItem('auth_token'));
  expect(token, 'the browser session must be authenticated').toBeTruthy();
  return { Authorization: `Bearer ${token}` };
}

export async function apiRequest<T>(
  page: Page,
  method: string,
  endpoint: string,
  data?: unknown
): Promise<T> {
  const response = await page.request.fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: await authHeaders(page),
    data
  });
  expect(response.ok(), `${method} ${endpoint} should succeed`).toBeTruthy();
  return (await response.json()) as T;
}

export class E2eRecords {
  private readonly deletePaths: string[] = [];

  constructor(private readonly page: Page) {}

  async create<T>(endpoint: string, data: unknown, cleanupPath: string): Promise<T> {
    const result = await apiRequest<T>(this.page, 'POST', endpoint, data);
    this.deletePaths.push(cleanupPath);
    return result;
  }

  track(cleanupPath: string): void {
    this.deletePaths.push(cleanupPath);
  }

  async cleanup(): Promise<void> {
    const headers = await authHeaders(this.page).catch(() => null);
    if (!headers) return;

    for (const path of this.deletePaths.reverse()) {
      const response = await this.page.request.delete(`${API_BASE_URL}${path}`, { headers });
      expect(
        response.ok() || response.status() === 404,
        `DELETE ${path} should succeed or already be absent`
      ).toBeTruthy();
    }
  }
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export async function expectDesktopOrNarrowLayout(page: Page): Promise<void> {
  await expect(page.locator('#root')).toBeVisible();
  const viewportWidth = page.viewportSize()?.width ?? 1280;
  const bodyWidth = await page.locator('body').evaluate((body) => body.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
}
