import { expect, test as base } from '@playwright/test';
import { API_BASE_URL, E2eRecords, TEST_PASSWORD } from './support';

interface E2eFixtures {
  records: E2eRecords;
}

let cleanupToken: string | undefined;

export const test = base.extend<E2eFixtures>({
  records: async ({ page, request }, use) => {
    if (!cleanupToken) {
      const response = await request.post(`${API_BASE_URL}/auth/login`, {
        data: { username: 'test_superuser', password: TEST_PASSWORD }
      });
      expect(response.ok(), 'the E2E cleanup account must be available').toBeTruthy();
      const payload = (await response.json()) as { token?: unknown };
      expect(typeof payload.token, 'the cleanup login must return a token').toBe('string');
      cleanupToken = String(payload.token);
    }

    const records = new E2eRecords(page, request, {
      Authorization: `Bearer ${cleanupToken}`
    });
    await use(records);
    await records.cleanup();
  }
});

export { expect };
