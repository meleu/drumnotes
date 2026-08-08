import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { BARS, defaultPattern } from '../../src/core/pattern.js';

// Browser tests assert on DOM structure and counts, never on pixels.

const staff = '.sheet svg';
const noteheads = `${staff} .vf-notehead`;

/** The vertical position of each drawn measure, deduped into systems. */
async function systemCount(page: Page): Promise<number> {
  const staves = page.locator(`${staff} .vf-stave`);
  await expect(staves).toHaveCount(BARS);

  const tops = await staves.evaluateAll((nodes) =>
    nodes.map((node) => Math.round((node as SVGGraphicsElement).getBBox().y)),
  );
  return new Set(tops).size;
}

test('draws no staff at all until the music font has loaded', async ({ page }) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.woff2', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'commit' });

  // The grid is already usable while the notation is still waiting on its font.
  await expect(page.locator('button[data-instrument="kick"]').first()).toBeVisible();
  await expect(page.locator(staff)).toHaveCount(0);

  release();
  await expect(page.locator(staff)).toHaveCount(1);
});

test.describe('once the font has loaded', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.waitForSelector(staff);
  });

  test('toggling a cell changes the number of noteheads drawn', async ({ page }) => {
    const before = await page.locator(noteheads).count();
    const silent = defaultPattern().lanes.snare.indexOf(false);
    const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);

    await cell.click();
    await expect(page.locator(noteheads)).toHaveCount(before + 1);

    await cell.click();
    await expect(page.locator(noteheads)).toHaveCount(before);
  });

  test('opens every system with a percussion clef and only the first bar with a time signature', async ({
    page,
  }) => {
    await expect(page.locator(`${staff} .vf-clef`)).toHaveCount(await systemCount(page));
    await expect(page.locator(`${staff} .vf-timesignature`)).toHaveCount(1);
  });

  test('keeps the grid entirely above the staff', async ({ page }) => {
    const order = await page.evaluate(() => {
      const grid = document.querySelector('.grid')!;
      const notation = document.querySelector('.staff')!;
      return {
        // Node.DOCUMENT_POSITION_FOLLOWING: the staff comes after the grid.
        documentOrder: grid.compareDocumentPosition(notation) & Node.DOCUMENT_POSITION_FOLLOWING,
        gridBottom: grid.getBoundingClientRect().bottom,
        staffTop: notation.getBoundingClientRect().top,
      };
    });

    expect(order.documentOrder).toBeTruthy();
    expect(order.staffTop).toBeGreaterThanOrEqual(order.gridBottom);
  });

  test('puts both bars on one system when wide and one per system when narrow', async ({
    page,
  }) => {
    expect(await systemCount(page)).toBe(1);

    await page.setViewportSize({ width: 390, height: 900 });
    await expect
      .poll(async () => await systemCount(page), { message: 'systems after narrowing' })
      .toBe(BARS);
  });

  test('renders the staff without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.reload();
    await page.waitForSelector(noteheads);

    expect(errors).toEqual([]);
  });
});
