import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { serialisePattern } from '../../src/core/codec.js';
import type { Pattern } from '../../src/core/pattern.js';
import {
  BARS,
  INSTRUMENTS,
  STEPS_PER_BAR,
  TOTAL_STEPS,
  defaultPattern,
  withArticulation,
} from '../../src/core/pattern.js';
import { loopDuration, stepDuration } from '../../src/core/schedule.js';

/* Middling: a bar passes inside a test, yet a step lasts several polls so the
   playhead can be watched, not inferred. */
const TEMPO = 120;
const STEP_MS = stepDuration(TEMPO) * 1000;
const BAR_MS = STEP_MS * STEPS_PER_BAR;
const LOOP_MS = loopDuration(TEMPO) * 1000;

/** Fixed heartbeat, so a bar cannot slip between samples. */
const WATCHING = { intervals: [STEP_MS / 2] };

const transport = '.transport';
const lit = '.cell.playing';
const shading = '.playhead rect';

async function load(page: Page, pattern: Pattern = defaultPattern()): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern({ ...pattern, tempo: TEMPO })],
  );
  await page.reload();
  await expect(page.locator(transport)).toBeEnabled();
  await page.waitForSelector('.sheet svg');
}

/** The step the grid is lighting, or null. */
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

  // One whole column and only that: every row of one step.
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

  // Both bars share a system at this width, so reaching the second measure is a
  // change of x.
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

test('follows steps through an ornamented groove, never a grace hit', async ({ page }) => {
  // Every snare flammed, so a grace hit sounds before each: no cell for it to
  // light, and nothing should try.
  const flammed = [...Array(TOTAL_STEPS).keys()].reduce(
    (pattern, step) => withArticulation(pattern, 'snare', step, 'flam'),
    defaultPattern(),
  );
  await load(page, flammed);
  await page.locator(transport).click();

  // Sampled across a beat: every lit cell in one column — a light following a
  // grace hit would show as two.
  for (let sample = 0; sample < 8; sample += 1) {
    const steps = await page
      .locator(lit)
      .evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-step')))]);

    expect(steps).toHaveLength(1);
    await page.waitForTimeout(STEP_MS / 2);
  }
});

test('clears both highlights on stop, and starts the next pass from the top', async ({ page }) => {
  await load(page);

  await page.locator(transport).click();
  // Well past the downbeat, so only a rewind relights step 0.
  await expect.poll(async () => await litStep(page), WATCHING).toBeGreaterThan(0);

  await page.locator(transport).click();
  await expect(page.locator(lit)).toHaveCount(0);
  await expect(page.locator(shading)).toHaveCount(0);

  await page.locator(transport).click();
  expect(await litStep(page)).toBe(0);
});
