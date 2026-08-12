import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { DEFAULT_TEMPO, defaultPattern } from '../../src/core/pattern.js';

// Each test gets its own context, so the library starts empty unless seeded.

const toggle = '[data-patterns="toggle"]';
const panel = '#patterns-panel';
const field = '[data-patterns="name"]';
const save = '[data-patterns="save"]';
const rows = `${panel} .row`;

/** Cells the grid shows as written, across every instrument. */
function written(page: Page) {
  return page.locator('button[data-instrument][aria-pressed="true"]');
}

function row(page: Page, name: string) {
  return page.locator(`${panel} [data-pattern="${name}"]`);
}

/** What it takes to keep the groove on the grid under a name. */
async function keep(page: Page, name: string): Promise<void> {
  await page.locator(field).fill(name);
  await page.locator(save).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the panel is closed when the app opens', async ({ page }) => {
  await expect(page.locator(toggle)).toBeVisible();
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(panel)).toHaveCount(0);
});

test('the control opens the panel and closes it again', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.locator(panel)).toBeVisible();
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'true');

  await page.locator(toggle).click();

  await expect(page.locator(panel)).toHaveCount(0);
});

test('the panel holds a labelled field, a Save button and the rows, in order', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.getByLabel('Name')).toHaveCount(1);
  await expect(page.locator(`${panel} :is(input, button, .row)`)).toHaveText([
    '', // the name field carries no text of its own
    'Save',
  ]);

  await keep(page, 'Bossa');

  await expect(page.locator(`${panel} :is(input, button, .row)`)).toHaveText(['', 'Save', /Bossa/]);
});

test('an empty library says so in place of the rows', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.locator('[data-patterns="empty"]')).toBeVisible();
  await expect(page.locator(rows)).toHaveCount(0);

  await keep(page, 'Bossa');

  await expect(page.locator('[data-patterns="empty"]')).toHaveCount(0);
});

test('keeping a groove under a name lists it with its tempo', async ({ page }) => {
  await page.locator(toggle).click();

  await keep(page, 'Bossa');

  await expect(row(page, 'Bossa')).toContainText('Bossa');
  await expect(row(page, 'Bossa')).toContainText(`${DEFAULT_TEMPO} BPM`);
});

test('the panel stays open after a save, with the new row in it', async ({ page }) => {
  await page.locator(toggle).click();

  await keep(page, 'Bossa');

  await expect(page.locator(panel)).toBeVisible();
  await expect(row(page, 'Bossa')).toBeVisible();
});

test('saving leaves the groove on the grid alone', async ({ page }) => {
  const before = await written(page).count();
  expect(before).toBeGreaterThan(0);
  await page.locator(toggle).click();

  await keep(page, 'Bossa');

  await expect(written(page)).toHaveCount(before);
  await expect(page.locator('input[aria-label="Tempo in beats per minute"]')).toHaveValue(
    String(DEFAULT_TEMPO),
  );
});

test('the library is still there after a reload', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await page.reload();
  await page.locator(toggle).click();

  await expect(row(page, 'Bossa')).toContainText(`${DEFAULT_TEMPO} BPM`);
});

test('a cell tap and a save both land: neither write loses the other', async ({ page }) => {
  const silent = defaultPattern().lanes.kick.indexOf('empty');
  const cell = page.locator(`button[data-instrument="kick"][data-step="${silent}"]`);
  await page.locator(toggle).click();

  await cell.click();
  await keep(page, 'Bossa');

  await page.reload();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await page.locator(toggle).click();
  await expect(row(page, 'Bossa')).toBeVisible();
});
