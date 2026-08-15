import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { DYNAMICS, INSTRUMENTS, defaultPattern } from '../../src/core/pattern.js';
import { audioLog, instrumentAudio } from './support/audio-log.js';

/** Every rung of every instrument the app can sound. */
const SAMPLE_COUNT = INSTRUMENTS.length * DYNAMICS.length;

/** First cell the default groove leaves empty in a lane. */
function silentCell(page: Page, instrument: 'hihat' | 'snare' | 'kick') {
  const step = defaultPattern().lanes[instrument].indexOf('empty');
  return page.locator(`button[data-instrument="${instrument}"][data-step="${step}"]`);
}

test.beforeEach(async ({ page }) => {
  await instrumentAudio(page);
});

test('decodes every rung of every instrument, exactly once, before enabling the grid', async ({
  page,
}) => {
  await page.goto('/');

  const cell = silentCell(page, 'snare');
  await expect(cell).toBeEnabled();

  const log = await audioLog(page);
  expect(log.decodes).toBe(SAMPLE_COUNT);
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

test('sounds a plain hit at the rung its own instrument calls plain', async ({ page }) => {
  await page.goto('/');
  await expect(silentCell(page, 'snare')).toBeEnabled();

  await silentCell(page, 'snare').click();
  await silentCell(page, 'kick').click();
  // The closed hi-hat, and only it, reads -Soft where the others read -Med:
  // at -Med it sits on top of the groove instead of under it.
  await silentCell(page, 'hihat').click();

  expect((await audioLog(page)).samples).toEqual(['Snare-Med', 'Kick-Med', 'HatClosed-Soft']);
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
  expect(log.decodes).toBe(SAMPLE_COUNT);
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
