import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { serialisePattern } from '../../src/core/codec.js';
import {
  BARS,
  STEPS_PER_BAR,
  TOTAL_STEPS,
  defaultPattern,
  withArticulation,
} from '../../src/core/pattern.js';

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

test('marks an accented cell and leaves a plain one bare', async ({ page }) => {
  const step = defaultPattern().lanes.snare.indexOf('normal');
  const plain = defaultPattern().lanes.hihat.indexOf('normal');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(withArticulation(defaultPattern(), 'snare', step, 'accent'))],
  );
  await page.reload();

  // SMuFL articAccentAbove: the same mark the staff engraves, so grid and page
  // say one thing rather than two.
  await expect(
    page.locator(`button[data-instrument="snare"][data-step="${step}"] .mark`),
  ).toHaveText('\u{E4A0}');
  await expect(
    page.locator(`button[data-instrument="hihat"][data-step="${plain}"] .mark`),
  ).toBeEmpty();
});

test('marks a ghosted cell with the pair the staff brackets it in', async ({ page }) => {
  const step = defaultPattern().lanes.snare.indexOf('normal');
  const accented = defaultPattern().lanes.hihat.indexOf('normal');
  let pattern = withArticulation(defaultPattern(), 'snare', step, 'ghost');
  pattern = withArticulation(pattern, 'hihat', accented, 'accent');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(pattern)],
  );
  await page.reload();

  // SMuFL noteheadParenthesis: the parentheses of the page, as one glyph with
  // the head's own space left empty — which on a cell is the cell.
  await expect(
    page.locator(`button[data-instrument="snare"][data-step="${step}"] .mark`),
  ).toHaveText('\u{E0CE}');
  // And not the mark of the articulation beside it in the menu.
  await expect(
    page.locator(`button[data-instrument="hihat"][data-step="${accented}"] .mark`),
  ).toHaveText('\u{E4A0}');
});

test('keeps an accented cell marked as the playhead lights its column', async ({ page }) => {
  const step = defaultPattern().lanes.snare.indexOf('normal');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(withArticulation(defaultPattern(), 'snare', step, 'accent'))],
  );
  await page.reload();

  const cell = page.locator(`button[data-instrument="snare"][data-step="${step}"]`);
  await expect(cell).toBeEnabled();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(cell).toHaveClass(/playing/);

  // A written cell keeps its own colour under the playhead, so the mark keeps
  // the one ground it was drawn to read against.
  await expect(cell.locator('.mark')).toHaveText('\u{E4A0}');
  const [markColour, cellColour] = await cell.evaluate((node) => [
    getComputedStyle(node.querySelector('.mark')!).color,
    getComputedStyle(node).backgroundColor,
  ]);
  expect(markColour).not.toBe(cellColour);
});
