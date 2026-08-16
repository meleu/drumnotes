import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { serialisePattern } from '../../src/core/codec.js';
import type { InstrumentId, Pattern } from '../../src/core/pattern.js';
import {
  MAX_TEMPO,
  TOTAL_STEPS,
  defaultPattern,
  emptyPattern,
  toggleStep,
  withArticulation,
} from '../../src/core/pattern.js';
import { graceLead, loopDuration, stepDuration } from '../../src/core/schedule.js';
import { audioLog, instrumentAudio } from './support/audio-log.js';

/* Top of the tempo range throughout, so a whole loop passes in a couple of
   seconds and a test can watch one wrap around. */
const TEMPO = MAX_TEMPO;
const LOOP_MS = loopDuration(TEMPO) * 1000;

/** The one transport button, whatever it reads. */
const transport = '.transport';

function at(pattern: Pattern, hits: Partial<Record<InstrumentId, readonly number[]>>): Pattern {
  return Object.entries(hits).reduce(
    (next, [id, steps]) =>
      steps.reduce((written, step) => toggleStep(written, id as InstrumentId, step), next),
    pattern,
  );
}

async function load(page: Page, pattern: Pattern): Promise<void> {
  await instrumentAudio(page);
  await page.goto('/');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern({ ...pattern, tempo: TEMPO })],
  );
  await page.reload();
  await expect(page.locator(transport)).toBeEnabled();
}

/** Hits handed over with a time, rather than auditioned. */
async function scheduled(page: Page): Promise<number[]> {
  const { starts } = await audioLog(page);
  return starts.filter((when): when is number => typeof when === 'number');
}

test('starts and stops the transport', async ({ page }) => {
  await load(page, defaultPattern());

  // The button names what pressing it does, not what the transport is doing.
  await expect(page.locator(transport)).toHaveAttribute('data-state', 'stopped');
  await expect(page.locator(transport)).toHaveText('Play');

  await page.locator(transport).click();
  await expect(page.locator(transport)).toHaveAttribute('data-state', 'playing');
  await expect(page.locator(transport)).toHaveText('Stop');

  await page.locator(transport).click();
  await expect(page.locator(transport)).toHaveAttribute('data-state', 'stopped');
  await expect(page.locator(transport)).toHaveText('Play');
});

test('hands every hit to the hardware as a time on the audio clock', async ({ page }) => {
  await load(page, defaultPattern());

  await page.locator(transport).click();
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThanOrEqual(4);

  const times = await scheduled(page);
  expect(times.every((when) => when > 0)).toBe(true);
  expect(times.toSorted((a, b) => a - b)).toEqual(times);
});

test('loops past the end of the pattern without being asked again', async ({ page }) => {
  const hitsPerLoop = TOTAL_STEPS;
  await load(page, at(emptyPattern(), { hihat: [...Array(TOTAL_STEPS).keys()] }));

  await page.locator(transport).click();

  await expect
    .poll(async () => (await scheduled(page)).length, { timeout: LOOP_MS * 3 })
    .toBeGreaterThan(hitsPerLoop);
});

test('drops the hits it had queued when stopped, and queues no more', async ({ page }) => {
  await load(page, at(emptyPattern(), { hihat: [...Array(TOTAL_STEPS).keys()] }));

  await page.locator(transport).click();
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThan(0);

  await page.locator(transport).click();
  const settled = await audioLog(page);
  expect(settled.stops).toBeGreaterThan(0);

  await page.waitForTimeout(LOOP_MS / 2);
  expect((await scheduled(page)).length).toBe(settled.starts.length);
});

test('sounds a cell enabled during playback on the next pass', async ({ page }) => {
  await load(page, emptyPattern());

  await page.locator(transport).click();
  await page.waitForTimeout(300);
  expect(await scheduled(page)).toEqual([]);

  await page.locator('button[data-instrument="kick"][data-step="0"]').click();

  await expect
    .poll(async () => (await scheduled(page)).length, { timeout: LOOP_MS * 2 })
    .toBeGreaterThan(0);
});

test('plays a ghosted hit softer than the plain hits around it', async ({ page }) => {
  // A snare on every beat, the second of them ghosted: the hardware is handed
  // the softest recording for that one and the plain rung for its neighbours,
  // which is the whole of what makes a ghost note quieter (ADR 0006).
  const pattern = at(emptyPattern(), { snare: [0, 4, 8, 12] });
  await load(page, withArticulation(pattern, 'snare', 4, 'ghost'));

  await page.locator(transport).click();
  await expect.poll(async () => (await audioLog(page)).samples.length).toBeGreaterThanOrEqual(4);

  expect((await audioLog(page)).samples.slice(0, 4)).toEqual([
    'Snare-Med',
    'Snare-Softest',
    'Snare-Med',
    'Snare-Med',
  ]);
});

test('leads a flam with a grace hit and lands its own hit exactly on the step', async ({
  page,
}) => {
  // Snares on the beat, the second of them flammed: the plain ones fix where
  // the steps are, so the ornament can be measured against them.
  const pattern = at(emptyPattern(), { snare: [0, 4, 8] });
  await load(page, withArticulation(pattern, 'snare', 4, 'flam'));

  await page.locator(transport).click();
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThanOrEqual(4);

  const log = await audioLog(page);
  expect(log.samples.slice(0, 4)).toEqual([
    'Snare-Med',
    'Snare-Softest',
    'Snare-Hard',
    'Snare-Med',
  ]);

  const [first, grace, main, last] = (await scheduled(page)).slice(0, 4) as number[];
  const step = stepDuration(TEMPO);
  // The hit itself is exactly where a plain hit would have been, and the grace
  // hit one lead ahead of it — not a step, not a subdivision.
  expect(main! - first!).toBeCloseTo(4 * step, 4);
  expect(last! - main!).toBeCloseTo(4 * step, 4);
  expect(main! - grace!).toBeCloseTo(graceLead(TEMPO), 4);
  // At the top of the tempo range, still clear of the sixteenth before it.
  expect(grace!).toBeGreaterThan(first! + 3 * step);
});

test('hands nothing over as a moment already gone by, grace hits included', async ({ page }) => {
  // A flam on every step: every sound the vocabulary can place before its own
  // step, as often as the pattern can place it. A time already past sounds at
  // once, which would collapse the ornament into a smear (ADR 0006).
  const flams = [...Array(TOTAL_STEPS).keys()].reduce(
    (pattern, step) => withArticulation(pattern, 'snare', step, 'flam'),
    emptyPattern(),
  );
  await load(page, flams);

  await page.locator(transport).click();
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThan(TOTAL_STEPS);

  const { starts, clocks } = await audioLog(page);
  for (const [index, when] of starts.entries()) {
    if (typeof when !== 'number') continue;
    expect(`${index}: ${when >= clocks[index]!}`).toBe(`${index}: true`);
  }
});

test('starts from the top again after a stop', async ({ page }) => {
  // Only the downbeat is written, so a pass's first hit arrives at once if
  // playback rewound, and up to a loop later if not.
  await load(page, at(emptyPattern(), { kick: [0] }));

  await page.locator(transport).click();
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThan(0);

  await page.locator(transport).click();
  await page.waitForTimeout(LOOP_MS / 2);
  const before = (await scheduled(page)).length;

  await page.locator(transport).click();
  // Far shorter than a loop: only a rewind gives a downbeat this soon.
  await expect
    .poll(async () => (await scheduled(page)).length, { timeout: 400 })
    .toBeGreaterThan(before);
});
