import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { serialisePattern } from '../../src/core/codec.js';
import {
  DEFAULT_TEMPO,
  MAX_TEMPO,
  MIN_TEMPO,
  TOTAL_STEPS,
  emptyPattern,
  toggleStep,
} from '../../src/core/pattern.js';
import { stepDuration } from '../../src/core/schedule.js';
import { audioLog, instrumentAudio } from './support/audio-log.js';

const field = 'input[aria-label="Tempo in beats per minute"]';
const transport = '.transport';

/** Types a tempo and commits it, as a keyboard user does. */
async function type(page: Page, bpm: string): Promise<void> {
  await page.locator(field).fill(bpm);
  await page.locator(field).press('Enter');
}

test('shows the current tempo as an editable number', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator(field)).toHaveValue(String(DEFAULT_TEMPO));
});

test('corrects a typed tempo outside the range instead of trusting it', async ({ page }) => {
  await page.goto('/');

  await type(page, '999');
  await expect(page.locator(field)).toHaveValue(String(MAX_TEMPO));

  await type(page, '1');
  await expect(page.locator(field)).toHaveValue(String(MIN_TEMPO));
});

test('advertises the range to the browser as well as enforcing it', async ({ page }) => {
  // Attributes hint to the spinner and phone keypad; the core clamp above is
  // what holds the tempo in range.
  await page.goto('/');

  await expect(page.locator(field)).toHaveAttribute('min', String(MIN_TEMPO));
  await expect(page.locator(field)).toHaveAttribute('max', String(MAX_TEMPO));
});

test('the tempo survives a reload', async ({ page }) => {
  await page.goto('/');

  await type(page, '137');
  await page.reload();

  await expect(page.locator(field)).toHaveValue('137');
});

test('changes the rate mid-playback without stopping', async ({ page }) => {
  // A hit every step, so gaps between scheduled times read the tempo straight
  // off the audio clock.
  await instrumentAudio(page);
  await page.goto('/');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [
      STORAGE_KEY,
      serialisePattern(
        [...Array(TOTAL_STEPS).keys()].reduce(
          (pattern, step) => toggleStep(pattern, 'hihat', step),
          { ...emptyPattern(), tempo: MIN_TEMPO },
        ),
      ),
    ],
  );
  await page.reload();
  await expect(page.locator(transport)).toBeEnabled();

  await page.locator(transport).click();
  await expect.poll(async () => (await audioLog(page)).starts.length).toBeGreaterThan(1);

  await type(page, String(MAX_TEMPO));

  // Still playing, now handing over hits a step apart at the new tempo.
  await expect(page.locator(transport)).toHaveAttribute('data-state', 'playing');
  const before = (await audioLog(page)).starts.length;
  await expect
    .poll(async () => (await audioLog(page)).starts.length)
    .toBeGreaterThan(before + TOTAL_STEPS);

  const times = (await audioLog(page)).starts.filter((when): when is number => when !== undefined);
  const gaps = times.slice(1).map((when, index) => when - times[index]!);
  expect(Math.min(...gaps.slice(-TOTAL_STEPS))).toBeCloseTo(stepDuration(MAX_TEMPO), 3);
});
