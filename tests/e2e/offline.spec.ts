import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { DYNAMICS, INSTRUMENTS } from '../../src/core/pattern.js';

/** Every rung the app can sound: the subset the build carries, and so all the
 *  worker has to cache. */
const SAMPLE_COUNT = INSTRUMENTS.length * DYNAMICS.length;

// Against a preview of the production build, the only place the worker exists.
// Asserts what the browser can still do without a network.

const staff = '.sheet svg';
const transport = '.transport';
const cell = 'button[data-instrument="kick"]';

/** Every path this origin has cached, under any cache name. */
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
 * Waits until the app is fully up: staff drawn (needs the font), transport
 * enabled (needs every sample decoded). Both load-bearing — that is how this
 * spec sees font and samples came back, without a network log.
 */
async function ready(page: Page): Promise<void> {
  await page.waitForSelector(staff);
  await expect(page.locator(cell).first()).toBeVisible();
  await expect(page.locator(transport)).toBeEnabled();
}

/** One online visit, waited out until the worker has everything. */
async function warm(page: Page): Promise<void> {
  // Relative, so it lands on the build's directory, not the origin root.
  await page.goto('./');
  await ready(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // The point of the strategy: one online visit fills the cache, so this waits
  // on the worker catching up, not a second visit.
  await expect
    .poll(async () => {
      const paths = await cached(page);
      return {
        js: paths.some((path) => path.endsWith('.js')),
        font: paths.some((path) => path.endsWith('.woff2')),
        samples: paths.filter((path) => path.endsWith('.wav')).length,
      };
    })
    .toEqual({ js: true, font: true, samples: SAMPLE_COUNT });
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
  // Seeded before the app's scripts, so it's there when the worker activates.
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

  // The document is the one mutable file: it names the build's hashed assets, so
  // a stale copy pins an old deploy. Poisoning the cached copy stands in for a
  // deploy — what the page shows next is what the worker chose.
  const poison = async () =>
    await page.evaluate(async (html) => {
      const cache = await caches.open((await caches.keys())[0]!);
      // Cached under the directory the app is served from.
      await cache.put(
        location.pathname,
        new Response(html, { headers: { 'content-type': 'text/html' } }),
      );
    }, '<!doctype html><title>stale</title>');

  await poison();
  await page.reload();
  await expect(page).toHaveTitle('drumnotes');

  // Fresh copy replaced the poisoned one, so the next offline load is current.
  await page.waitForFunction(async () => {
    const cached = await caches.match(location.pathname, { ignoreVary: true });
    return (await cached?.text())?.includes('<title>drumnotes</title>') === true;
  });
});
