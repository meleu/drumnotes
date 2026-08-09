import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { serialisePattern } from '../../src/core/codec.js';
import type { InstrumentId, Pattern } from '../../src/core/pattern.js';
import {
  BARS,
  BEATS_PER_BAR,
  TOTAL_STEPS,
  defaultPattern,
  emptyPattern,
  toggleStep,
} from '../../src/core/pattern.js';

// Browser tests assert on DOM structure and counts, never pixels.

const staff = '.sheet svg';
const noteheads = `${staff} .vf-notehead`;
/** VexFlow gives each beam and flag its own class. */
const beams = `${staff} .vf-beam`;
const flags = `${staff} .vf-flag`;

/** A pattern from absolute step indices. */
function patternWith(hits: Partial<Record<InstrumentId, readonly number[]>>): Pattern {
  return Object.entries(hits).reduce(
    (pattern, [id, steps]) =>
      steps.reduce((next, step) => toggleStep(next, id as InstrumentId, step), pattern),
    emptyPattern(),
  );
}

/** Loads the app on a pattern, without clicking it in cell by cell. */
async function load(page: Page, pattern: Pattern): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(pattern)],
  );
  await page.reload();
  await page.waitForSelector(staff);
}

/** Augmentation dots on the staff. The font draws one as the SMuFL glyph below,
 *  so counting them is structural, not pixels. */
const AUGMENTATION_DOT = '\u{E1E7}';

async function augmentationDots(page: Page): Promise<number> {
  return await page
    .locator(`${staff} g.vf-stavenote text`)
    .evaluateAll(
      (nodes, glyph) => nodes.filter((node) => node.textContent === glyph).length,
      AUGMENTATION_DOT,
    );
}

/** Measure tops, deduped into systems. */
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

  // The grid is usable while the notation still waits on its font.
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
        // DOCUMENT_POSITION_FOLLOWING: the staff comes after the grid.
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

  test('beams a straight sixteenth hi-hat line instead of flagging it', async ({ page }) => {
    await load(page, patternWith({ hihat: [...Array(TOTAL_STEPS).keys()] }));

    // One beam per beat, nothing left flagged.
    await expect(page.locator(beams)).toHaveCount(BARS * BEATS_PER_BAR);
    await expect(page.locator(flags)).toHaveCount(0);
  });

  test('leaves a lone flagged note its flag', async ({ page }) => {
    // A lone hi-hat on the second sixteenth is `16r 8.`: one flagged note with
    // nothing to beam it to.
    await load(page, patternWith({ hihat: [1] }));

    await expect(page.locator(flags)).toHaveCount(1);
    await expect(page.locator(beams)).toHaveCount(0);
  });

  test('draws an augmentation dot for a dotted value, and fills the measure', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    expect(await augmentationDots(page)).toBe(0);

    // The feet play nothing on beat 2, so a kick on that beat's last sixteenth
    // follows three silent ones: a dotted-eighth rest — the shortest route from
    // the default groove to a dotted value.
    await page.locator('button[data-instrument="kick"][data-step="7"]').click();

    await expect.poll(async () => await augmentationDots(page)).toBe(1);
    // A dot drawn but not counted leaves the measure short and the voice
    // rejected, so a clean console is half this test.
    expect(errors).toEqual([]);
  });
});
