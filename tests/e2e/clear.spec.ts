import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { INSTRUMENTS, defaultPattern } from '../../src/core/pattern.js';

const clear = '.clear';
const transport = '.transport';
const lit = '.cell.playing';

/** Cells the grid shows written, across every instrument. */
function written(page: Page) {
  return page.locator('button[data-instrument][aria-pressed="true"]');
}

/** Ask, then answer — what rubbing the pattern out takes. */
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

  // Waits the question out rather than answering.
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

  // The next press asks again rather than erasing.
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

/* A change of what is played, not an edit to what is playing: the loop stops
   rather than turning into a silent pulse. */
test('stops the transport and clears the playhead', async ({ page }) => {
  await expect(page.locator(transport)).toBeEnabled();
  await page.locator(transport).click();
  await expect(page.locator(lit)).not.toHaveCount(0);

  await clearPattern(page);

  await expect(page.locator(transport)).toHaveAttribute('data-state', 'stopped');
  await expect(page.locator(lit)).toHaveCount(0);
});

test('goes dead when there is nothing left to rub out', async ({ page }) => {
  await expect(page.locator(clear)).toBeEnabled();

  await clearPattern(page);
  await expect(page.locator(clear)).toBeDisabled();

  // One hit anywhere gives it something to do again.
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  await page.locator(`button[data-instrument="snare"][data-step="${silent}"]`).click();
  await expect(page.locator(clear)).toBeEnabled();
});
