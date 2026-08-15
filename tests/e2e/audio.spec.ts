import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { INSTRUMENTS, defaultPattern } from '../../src/core/pattern.js';
import { audioLog, instrumentAudio } from './support/audio-log.js';

/** First cell the default groove leaves empty in a lane. */
function silentCell(page: Page, instrument: 'hihat' | 'snare' | 'kick') {
  const step = defaultPattern().lanes[instrument].indexOf('empty');
  return page.locator(`button[data-instrument="${instrument}"][data-step="${step}"]`);
}

test.beforeEach(async ({ page }) => {
  await instrumentAudio(page);
});

test('decodes one sample per instrument, exactly once, before enabling the grid', async ({
  page,
}) => {
  await page.goto('/');

  const cell = silentCell(page, 'snare');
  await expect(cell).toBeEnabled();

  const log = await audioLog(page);
  expect(log.decodes).toBe(INSTRUMENTS.length);
  expect(log.latencyHints).toEqual(['interactive']);
});

test('holds the grid disabled while the samples are still arriving', async ({ page }) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.wav', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'commit' });

  const cell = silentCell(page, 'kick');
  await expect(cell).toBeDisabled();

  release();
  await expect(cell).toBeEnabled();
});

test('sounds a cell as it is written and stays silent as it is rubbed out', async ({ page }) => {
  await page.goto('/');
  const cell = silentCell(page, 'snare');
  await expect(cell).toBeEnabled();

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  // No time handed over: an audition sounds at once, not through a queue.
  expect((await audioLog(page)).starts).toEqual([undefined]);

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  expect((await audioLog(page)).starts).toEqual([undefined]);
});

test('reuses the decoded buffers however many times a lane is played', async ({ page }) => {
  await page.goto('/');
  const cell = silentCell(page, 'hihat');
  await expect(cell).toBeEnabled();

  for (let i = 0; i < 3; i += 1) {
    await cell.click();
    await cell.click();
  }

  const log = await audioLog(page);
  expect(log.starts).toHaveLength(3);
  expect(log.decodes).toBe(INSTRUMENTS.length);
});

test('wakes the audio context on the first press', async ({ page }) => {
  await page.goto('/');
  const cell = silentCell(page, 'kick');
  await expect(cell).toBeEnabled();

  const before = await audioLog(page);
  expect(before.state).toBe('suspended');

  await cell.click();

  await expect.poll(async () => (await audioLog(page)).state).toBe('running');
  expect((await audioLog(page)).resumes).toBeGreaterThanOrEqual(1);
});
