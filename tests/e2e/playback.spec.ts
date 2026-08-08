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
} from '../../src/core/pattern.js';
import { loopDuration } from '../../src/core/schedule.js';
import { audioLog, instrumentAudio } from './support/audio-log.js';

/*
 * Playback runs at the top of the tempo range throughout, so a whole loop goes
 * by in a couple of seconds and a test can watch one wrap around.
 */
const TEMPO = MAX_TEMPO;
const LOOP_MS = loopDuration(TEMPO) * 1000;

/** The one transport button, whatever it currently reads. */
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

/** Hits handed over with a time on the audio clock, rather than auditioned. */
async function scheduled(page: Page): Promise<number[]> {
  const { starts } = await audioLog(page);
  return starts.filter((when): when is number => typeof when === 'number');
}

test('starts and stops the transport', async ({ page }) => {
  await load(page, defaultPattern());

  // The one button offers whichever action is available, so it always names
  // what pressing it will do rather than what the transport is doing.
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

test('starts from the top again after a stop', async ({ page }) => {
  // Only the downbeat is written, so the first hit of a pass arrives at once if
  // playback rewound and up to a whole loop later if it did not.
  await load(page, at(emptyPattern(), { kick: [0] }));

  await page.locator(transport).click();
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThan(0);

  await page.locator(transport).click();
  await page.waitForTimeout(LOOP_MS / 2);
  const before = (await scheduled(page)).length;

  await page.locator(transport).click();
  // Far shorter than a loop: only a rewind can produce a downbeat this soon.
  await expect
    .poll(async () => (await scheduled(page)).length, { timeout: 400 })
    .toBeGreaterThan(before);
});
