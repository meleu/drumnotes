import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { INSTRUMENTS, defaultPattern } from '../../src/core/pattern.js';

const clear = '.clear';

/** Cells the grid shows as written, across every instrument. */
function written(page: Page) {
  return page.locator('button[data-instrument][aria-pressed="true"]');
}

/** Ask, then answer — what it takes to actually rub the pattern out. */
async function clearPattern(page: Page): Promise<void> {
  await page.locator(clear).click();
  await page.locator(clear).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('asks before rubbing anything out', async ({ page }) => {
  const before = await written(page).count();
  expect(before).toBeGreaterThan(0);

  await page.locator(clear).click();

  await expect(page.locator(clear)).toHaveAttribute('data-state', 'asking');
  await expect(page.locator(clear)).toHaveText('Sure?');
  await expect(written(page)).toHaveCount(before);
});

test('rubs out every hit once the question is answered', async ({ page }) => {
  await clearPattern(page);

  await expect(written(page)).toHaveCount(0);
  for (const { id } of INSTRUMENTS) {
    await expect(page.locator(`button[data-instrument="${id}"][aria-pressed="true"]`)).toHaveCount(
      0,
    );
  }
});

test('takes the question back when it goes unanswered', async ({ page }) => {
  const before = await written(page).count();

  await page.locator(clear).click();
  await expect(page.locator(clear)).toHaveAttribute('data-state', 'asking');

  // Waits out the question rather than answering it.
  await expect(page.locator(clear)).toHaveAttribute('data-state', 'idle', { timeout: 15000 });
  await expect(page.locator(clear)).toHaveText('Clear');
  await expect(written(page)).toHaveCount(before);
});

test('takes the question back when attention moves elsewhere', async ({ page }) => {
  const before = await written(page).count();

  await page.locator(clear).click();
  await expect(page.locator(clear)).toHaveAttribute('data-state', 'asking');

  await page.locator('h1').click();

  await expect(page.locator(clear)).toHaveAttribute('data-state', 'idle');
  await expect(written(page)).toHaveCount(before);

  // The next press asks again rather than erasing on the spot.
  await page.locator(clear).click();
  await expect(written(page)).toHaveCount(before);
});

test('a cleared grid stays cleared across a reload', async ({ page }) => {
  await clearPattern(page);
  await expect(written(page)).toHaveCount(0);

  await page.reload();

  await expect(page.locator('button[data-instrument="hihat"]').first()).toBeVisible();
  await expect(written(page)).toHaveCount(0);
});

test('clearing keeps the tempo the groove was played at', async ({ page }) => {
  const tempo = page.getByLabel('Tempo in beats per minute');
  await tempo.fill('140');
  await tempo.blur();

  await clearPattern(page);

  await expect(written(page)).toHaveCount(0);
  await expect(tempo).toHaveValue('140');
});

test('goes dead when there is nothing left to rub out', async ({ page }) => {
  await expect(page.locator(clear)).toBeEnabled();

  await clearPattern(page);
  await expect(page.locator(clear)).toBeDisabled();

  // Writing a single hit anywhere gives it something to do again.
  const silent = defaultPattern().lanes.snare.indexOf(false);
  await page.locator(`button[data-instrument="snare"][data-step="${silent}"]`).click();
  await expect(page.locator(clear)).toBeEnabled();
});
