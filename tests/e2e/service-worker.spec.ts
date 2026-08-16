import { expect, test } from '@playwright/test';

// The other side of the offline spec: no worker in development, so nothing sits
// between the dev server and a reload.
test('registers no service worker in development', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.transport')).toBeEnabled();

  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
