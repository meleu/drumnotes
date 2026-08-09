import { expect, test } from '@playwright/test';

// The other side of the offline spec: no worker in development. Nothing may sit
// between the dev server and a reload — not for this suite, not for someone
// with the app open while editing it.
test('registers no service worker in development', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.transport')).toBeEnabled();

  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
