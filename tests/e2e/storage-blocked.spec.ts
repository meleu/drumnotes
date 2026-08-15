import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { INSTRUMENTS, defaultPattern } from '../../src/core/pattern.js';

const toggle = '[data-patterns="toggle"]';
const panel = '#patterns-panel';
const field = '[data-patterns="name"]';
const save = '[data-patterns="save"]';
const blocked = '[data-patterns="blocked"]';
const empty = '[data-patterns="empty"]';
const rows = `${panel} .row`;
const clear = '.clear';
const transport = '.transport';
const lit = '.cell.playing';
const noteheads = '.sheet svg .vf-notehead';
const tempoField = 'input[aria-label="Tempo in beats per minute"]';

declare global {
  interface Window {
    /** Flipped by a test to let storage back in, to prove nothing re-probes. */
    __allowStorage: boolean;
  }
}

/**
 * A browser that refuses the store the way a real one does: touching
 * `localStorage` at all throws, rather than any one call failing. Installed
 * before any app code runs, so the app has never seen it working.
 */
async function blockStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const real = window.localStorage;
    window.__allowStorage = false;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        if (window.__allowStorage) return real;
        throw new DOMException('Access to storage is denied.', 'SecurityError');
      },
    });
  });
}

/** Cells the grid shows as written, across every instrument. */
function written(page: Page) {
  return page.locator('button[data-instrument][aria-pressed="true"]');
}

/** A kick cell the default groove leaves silent, named by its step so it can be
 *  found again once it has been written. */
function silentCell(page: Page) {
  const step = defaultPattern().lanes.kick.indexOf('empty');
  return page.locator(`button[data-instrument="kick"][data-step="${step}"]`);
}

test.beforeEach(async ({ page }) => {
  await blockStorage(page);
  await page.goto('/');
});

test('the panel says nothing can be kept, and holds nothing else', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.locator(blocked)).toBeVisible();
  await expect(page.locator(blocked)).toHaveText(
    'This browser will not let anything be kept here.',
  );

  // Not disabled — absent. Nothing invites a press that cannot work.
  await expect(page.locator(field)).toHaveCount(0);
  await expect(page.locator(save)).toHaveCount(0);
  await expect(page.locator(rows)).toHaveCount(0);
  // The two lines are distinct: a blocked store is not an empty library.
  await expect(page.locator(empty)).toHaveCount(0);
});

test('the control still opens the panel and closes it again', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.locator(panel)).toBeVisible();
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'true');

  await page.locator(toggle).click();

  await expect(page.locator(panel)).toHaveCount(0);
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'false');
});

test('availability is settled at startup: a store that opens up mid-session is not taken up', async ({
  page,
}) => {
  await page.evaluate(() => (window.__allowStorage = true));

  await page.locator(toggle).click();

  await expect(page.locator(blocked)).toBeVisible();
  await expect(page.locator(field)).toHaveCount(0);
});

test('the rest of the app carries on, and nothing reaches the console', async ({ page }) => {
  const complaints: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') complaints.push(message.text());
  });
  page.on('pageerror', (error) => complaints.push(error.message));

  // The grid takes an edit and the staff redraws to match.
  const before = await page.locator(noteheads).count();
  const cell = silentCell(page);
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(noteheads)).not.toHaveCount(before);

  // The tempo takes a new number.
  await page.locator(tempoField).fill('96');
  await page.locator(tempoField).press('Enter');
  await expect(page.locator(tempoField)).toHaveValue('96');

  // Playback runs and stops.
  await page.locator(transport).click();
  await expect(page.locator(lit)).toHaveCount(INSTRUMENTS.length);
  await page.locator(transport).click();
  await expect(page.locator(lit)).toHaveCount(0);

  // Export offers the picture, as it always did.
  await expect(page.locator('[data-export="download"]')).toBeEnabled();

  // Clear still asks, and still rubs out.
  await page.locator(clear).click();
  await page.locator(clear).click();
  await expect(written(page)).toHaveCount(0);

  expect(complaints).toEqual([]);
});

test('the pattern simply goes unsaved', async ({ page }) => {
  const cell = silentCell(page);
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  await page.reload();

  await expect(cell).toHaveAttribute('aria-pressed', 'false');
});
