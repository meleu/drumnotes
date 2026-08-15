import { expect, test } from '@playwright/test';

import { BARS, STEPS_PER_BAR, TOTAL_STEPS, defaultPattern } from '../../src/core/pattern.js';

// Browser tests assert on DOM structure and counts, never pixels.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('renders every step of every bar as a button per instrument row', async ({ page }) => {
  for (const instrument of ['hihat', 'snare', 'kick']) {
    await expect(page.locator(`button[data-instrument="${instrument}"]`)).toHaveCount(TOTAL_STEPS);
  }
});

test('orders the rows hi-hat, snare, kick, matching staff height', async ({ page }) => {
  const names = page.locator('.bar').first().locator('.name');

  // Abbreviated so the label column costs the cells little width; the full name
  // is carried as the tooltip.
  await expect(names).toHaveText(['HH', 'SD', 'BD']);
  for (const [row, name] of ['Hi-hat', 'Snare', 'Kick'].entries()) {
    await expect(names.nth(row)).toHaveAttribute('title', name);
  }
});

test('labels the columns with the counting, once per bar', async ({ page }) => {
  const counts = page.locator('.bar').first().locator('.count');

  await expect(counts).toHaveCount(STEPS_PER_BAR);
  await expect(counts).toHaveText('1 e + a 2 e + a 3 e + a 4 e + a'.split(' '));
});

test('toggling a cell flips its aria-pressed value', async ({ page }) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);

  await expect(cell).toHaveAttribute('aria-pressed', 'false');

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
});

test('stacks the bar blocks when narrow and sits them side by side when wide', async ({ page }) => {
  const barTop = async (index: number) => {
    const box = await page.locator('.bar').nth(index).boundingBox();
    return box?.y ?? 0;
  };

  await page.setViewportSize({ width: 390, height: 800 });
  expect(await barTop(BARS - 1)).toBeGreaterThan(await barTop(0));

  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await barTop(BARS - 1)).toBe(await barTop(0));
});

test('labels the rows once when the bars sit side by side, once per bar when stacked', async ({
  page,
}) => {
  const later = page
    .locator('.bar')
    .nth(BARS - 1)
    .locator('.name');

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(later).toHaveText(['HH', 'SD', 'BD']);

  // Read off the bar beside it instead; the labels would only repeat.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(later.first()).toBeHidden();
});

test('mounts without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.reload();
  await expect(page.locator('button[data-instrument="kick"]').first()).toBeVisible();

  expect(errors).toEqual([]);
});
