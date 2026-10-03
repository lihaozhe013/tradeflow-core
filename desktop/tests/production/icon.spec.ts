import { expect, test } from '@playwright/test';

test('loads the header icon from a standalone asset under the packaged CSP', async ({ page }) => {
  const cspViolations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy|img-src/i.test(message.text())) {
      cspViolations.push(message.text());
    }
  });
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        transformCallback: () => 1,
        invoke: async (command: string) => (command === 'get_settings' ? { language: 'en' } : [])
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} }
    });
  });

  await page.goto('/');
  const icon = page.locator('.app-header img.mark');
  await expect(icon).toBeVisible();
  await expect
    .poll(async () => icon.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  expect(await icon.getAttribute('src')).not.toMatch(/^data:/);
  expect(cspViolations).toEqual([]);
});
