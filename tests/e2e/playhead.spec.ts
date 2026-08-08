import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { serialisePattern } from '../../src/core/codec.js';
import { BARS, INSTRUMENTS, STEPS_PER_BAR, defaultPattern } from '../../src/core/pattern.js';
import { loopDuration, stepDuration } from '../../src/core/schedule.js';

/*
 * A middling tempo: fast enough that a whole bar goes by inside a test, slow
 * enough that a step lasts several polls and the playhead can be watched
 * rather than merely inferred.
 */
const TEMPO = 120;
const STEP_MS = stepDuration(TEMPO) * 1000;
const BAR_MS = STEP_MS * STEPS_PER_BAR;
const LOOP_MS = loopDuration(TEMPO) * 1000;

/** Polls on a fixed heartbeat, so a bar cannot slip by between two samples. */
const WATCHING = { intervals: [STEP_MS / 2] };

const transport = '.transport';
const lit = '.cell.playing';
const shading = '.playhead rect';

async function load(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern({ ...defaultPattern(), tempo: TEMPO })],
  );
  await page.reload();
  await expect(page.locator(transport)).toBeEnabled();
  await page.waitForSelector('.sheet svg');
}

/** Which step the grid is lighting, or null when nothing is lit. */
async function litStep(page: Page): Promise<number | null> {
  const cells = page.locator(lit);
  if ((await cells.count()) === 0) return null;
  return Number(await cells.first().getAttribute('data-step'));
}

test('lights nothing until the transport is running', async ({ page }) => {
  await load(page);

  await expect(page.locator(lit)).toHaveCount(0);
  await expect(page.locator(shading)).toHaveCount(0);
});

test('lights exactly one column, and advances it', async ({ page }) => {
  await load(page);
  await page.locator(transport).click();

  // One column, whole and only: every instrument row of one step, and nothing
  // of any other.
  await expect(page.locator(lit)).toHaveCount(INSTRUMENTS.length);

  const first = await litStep(page);
  expect(first).not.toBeNull();

  await expect
    .poll(async () => await litStep(page), { ...WATCHING, timeout: LOOP_MS })
    .not.toBe(first);
  await expect(page.locator(lit)).toHaveCount(INSTRUMENTS.length);
});

test('shades the one measure the playhead is reading, and moves on with it', async ({ page }) => {
  await load(page);
  await page.locator(transport).click();

  await expect(page.locator(shading)).toHaveCount(1);

  // Both bars are on one system at this width, so the shading moving to the
  // second measure is a change of x — the same thing a reader's eye does.
  const seen = new Set<string>();
  await expect
    .poll(
      async () => {
        const x = await page.locator(shading).first().getAttribute('x');
        if (x !== null) seen.add(x);
        return seen.size;
      },
      { ...WATCHING, timeout: BAR_MS * (BARS + 1) },
    )
    .toBe(BARS);
});

test('clears both highlights on stop, and starts the next pass from the top', async ({ page }) => {
  await load(page);

  await page.locator(transport).click();
  // Well past the downbeat, so a rewind is what returns the light to step 0.
  await expect.poll(async () => await litStep(page), WATCHING).toBeGreaterThan(0);

  await page.locator(transport).click();
  await expect(page.locator(lit)).toHaveCount(0);
  await expect(page.locator(shading)).toHaveCount(0);

  await page.locator(transport).click();
  expect(await litStep(page)).toBe(0);
});
