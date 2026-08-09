import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

// This spec runs against a preview of the production build, because that is the
// only place the service worker exists. Everything it asserts is about what the
// browser can still do once the network is taken away.

const staff = '.sheet svg';
const transport = '.transport';
const cell = 'button[data-instrument="kick"]';

/** Every path this origin has put in a cache, whatever the cache is called. */
async function cached(page: Page): Promise<string[]> {
  return await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(
      names.map(async (name) => {
        const requests = await (await caches.open(name)).keys();
        return requests.map((request) => new URL(request.url).pathname);
      }),
    );
    return entries.flat();
  });
}

/**
 * Waits until the app is fully up: the staff is drawn, which needs the music
 * font, and the transport is enabled, which needs every sample decoded. Both
 * are load-bearing here — they are how this spec tells that the font and the
 * samples came back, without reaching for a network log.
 */
async function ready(page: Page): Promise<void> {
  await page.waitForSelector(staff);
  await expect(page.locator(cell).first()).toBeVisible();
  await expect(page.locator(transport)).toBeEnabled();
}

/** One online visit, waited out until the worker has everything it needs. */
async function warm(page: Page): Promise<void> {
  await page.goto('/');
  await ready(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // The whole point of the strategy: one online visit populates the cache, so
  // the wait here is for the worker to catch up, not for a second visit.
  await expect
    .poll(async () => {
      const paths = await cached(page);
      return {
        js: paths.some((path) => path.endsWith('.js')),
        font: paths.some((path) => path.endsWith('.woff2')),
        samples: paths.filter((path) => path.endsWith('.wav')).length,
      };
    })
    .toEqual({ js: true, font: true, samples: 3 });
}

test('serves the app, its samples and its font from cache on a second load offline', async ({
  page,
  context,
}) => {
  await warm(page);

  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  page.on('requestfailed', (request) => failures.push(`failed: ${request.url()}`));

  await context.setOffline(true);
  await page.reload();

  await ready(page);
  expect(failures).toEqual([]);
});

test('drops caches left by an earlier version of the worker', async ({ page }) => {
  // Seeded before the app's own scripts run, so it is already there when the
  // worker activates and looks around.
  await page.addInitScript(async () => {
    const stale = await caches.open('drumnotes-stale');
    await stale.put('/previous-build.js', new Response('gone'));
  });

  await warm(page);

  await expect.poll(async () => await page.evaluate(() => caches.keys())).toHaveLength(1);
  expect(await cached(page)).not.toContain('/previous-build.js');
});

test('picks up a redeployed entry document rather than pinning the first one', async ({ page }) => {
  await warm(page);

  // The document is the one file that is not immutable: it is what names the
  // current build's hashed assets, so a stale copy pins the whole app to an old
  // deploy. Poisoning the cached copy stands in for a deploy — whatever the
  // page shows next is whatever the worker preferred.
  const poison = async () =>
    await page.evaluate(async (html) => {
      const cache = await caches.open((await caches.keys())[0]!);
      await cache.put('/', new Response(html, { headers: { 'content-type': 'text/html' } }));
    }, '<!doctype html><title>stale</title>');

  await poison();
  await page.reload();
  await expect(page).toHaveTitle('drumnotes');

  // And the fresh copy replaced the poisoned one, so the next load offline gets
  // the new deploy rather than the one before it.
  await page.waitForFunction(async () => {
    const cached = await caches.match('/', { ignoreVary: true });
    return (await cached?.text())?.includes('<title>drumnotes</title>') === true;
  });
});
