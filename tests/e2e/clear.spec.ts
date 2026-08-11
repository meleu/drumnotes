import { expect, test } from '@playwright/test';

import { INSTRUMENTS, defaultPattern } from '../../src/core/pattern.js';

const clear = '.clear';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('clearing rubs out every hit in the grid', async ({ page }) => {
  const written = page.locator('button[data-instrument][aria-pressed="true"]');
  await expect(written).not.toHaveCount(0);

  await page.locator(clear).click();

  await expect(written).toHaveCount(0);
  for (const { id } of INSTRUMENTS) {
    await expect(page.locator(`button[data-instrument="${id}"][aria-pressed="true"]`)).toHaveCount(
      0,
    );
  }
});

test('a cleared grid stays cleared across a reload', async ({ page }) => {
  await page.locator(clear).click();
  await expect(page.locator('button[data-instrument][aria-pressed="true"]')).toHaveCount(0);

  await page.reload();

  await expect(page.locator('button[data-instrument="hihat"]').first()).toBeVisible();
  await expect(page.locator('button[data-instrument][aria-pressed="true"]')).toHaveCount(0);
});

test('clearing keeps the tempo the groove was played at', async ({ page }) => {
  const tempo = page.getByLabel('Tempo in beats per minute');
  await tempo.fill('140');
  await tempo.blur();

  await page.locator(clear).click();

  await expect(tempo).toHaveValue('140');
});

test('goes dead when there is nothing left to rub out', async ({ page }) => {
  await expect(page.locator(clear)).toBeEnabled();

  await page.locator(clear).click();
  await expect(page.locator(clear)).toBeDisabled();

  // Writing a single hit anywhere gives it something to do again.
  const silent = defaultPattern().lanes.snare.indexOf(false);
  await page.locator(`button[data-instrument="snare"][data-step="${silent}"]`).click();
  await expect(page.locator(clear)).toBeEnabled();
});
