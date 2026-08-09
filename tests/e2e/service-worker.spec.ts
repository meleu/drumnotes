import { expect, test } from '@playwright/test';

// The other side of the offline spec: in development there is no worker at all.
// Nothing may sit between the dev server and a reload — not for the rest of this
// suite, and not for someone with the app open while they edit it.
test('registers no service worker in development', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.transport')).toBeEnabled();

  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
