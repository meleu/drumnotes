import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
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
import { storedApp } from './support/store.js';

/* Top of the range throughout, so a loop passes in a couple of seconds and a
   test can watch one wrap around. */
const TEMPO = MAX_TEMPO;
const LOOP_MS = loopDuration(TEMPO) * 1000;

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
    [STORAGE_KEY, storedApp({ ...pattern, tempo: TEMPO })],
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

  // The button names what pressing it does, not the transport's state.
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
  // An edit to what is playing, not a change of what is being played: the loop
  // carries on through it, unlike a load or a clear.
  await expect(page.locator(transport)).toHaveAttribute('data-state', 'playing');
});

test('plays a ghosted hit softer than the plain hits around it', async ({ page }) => {
  // Snare on every beat, the second ghosted: the hardware gets the softest
  // recording for it and the plain rung for its neighbours — the whole of what
  // makes a ghost quieter (ADR 0006).
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
  // Snares on the beat, the second flammed: the plain ones fix the steps, so the
  // ornament can be measured against them.
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
  // The hit exactly where a plain one would be, the grace hit a lead ahead —
  // not a step, not a subdivision.
  expect(main! - first!).toBeCloseTo(4 * step, 4);
  expect(last! - main!).toBeCloseTo(4 * step, 4);
  expect(main! - grace!).toBeCloseTo(graceLead(TEMPO), 4);
  // At the top of the range, still clear of the sixteenth before.
  expect(grace!).toBeGreaterThan(first! + 3 * step);
});

test('leads a drag with two grace hits, at two leads and one lead before its step', async ({
  page,
}) => {
  // Same groove as the flam's, so the two read against each other: plain snares
  // fixing the steps, the second dragged.
  const pattern = at(emptyPattern(), { snare: [0, 4, 8] });
  await load(page, withArticulation(pattern, 'snare', 4, 'drag'));

  await page.locator(transport).click();
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThanOrEqual(5);

  const log = await audioLog(page);
  // Three hits where a flam makes two, the extra a grace hit — the whole of what
  // tells a drag from a flam by ear.
  expect(log.samples.slice(0, 5)).toEqual([
    'Snare-Med',
    'Snare-Softest',
    'Snare-Softest',
    'Snare-Hard',
    'Snare-Med',
  ]);

  const [first, far, near, main, last] = (await scheduled(page)).slice(0, 5) as number[];
  const step = stepDuration(TEMPO);
  const lead = graceLead(TEMPO);
  // The hit exactly where a plain one would be, the two grace hits evenly spaced
  // back from it.
  expect(main! - first!).toBeCloseTo(4 * step, 4);
  expect(last! - main!).toBeCloseTo(4 * step, 4);
  expect(main! - near!).toBeCloseTo(lead, 4);
  expect(main! - far!).toBeCloseTo(2 * lead, 4);
  // At the top of the range, even the further stays clear of the sixteenth
  // before.
  expect(far!).toBeGreaterThan(first! + 3 * step);
});

test('hands nothing over as a moment already gone by, grace hits included', async ({ page }) => {
  // A drag every step: the furthest the vocabulary reaches, as often as it can
  // be placed. A time already past sounds at once, smearing the ornament
  // (ADR 0006).
  const drags = [...Array(TOTAL_STEPS).keys()].reduce(
    (pattern, step) => withArticulation(pattern, 'snare', step, 'drag'),
    emptyPattern(),
  );
  await load(page, drags);

  await page.locator(transport).click();
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThan(TOTAL_STEPS);

  const { starts, clocks } = await audioLog(page);
  for (const [index, when] of starts.entries()) {
    if (typeof when !== 'number') continue;
    expect(`${index}: ${when >= clocks[index]!}`).toBe(`${index}: true`);
  }
});

test('starts from the top again after a stop', async ({ page }) => {
  // Only the downbeat written: a pass's first hit arrives at once if playback
  // rewound, up to a loop later if not.
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
