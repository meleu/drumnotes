import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { INSTRUMENTS, defaultPattern } from '../../src/core/pattern.js';

/**
 * What the page did to the audio hardware. Recorded by wrapping the Web Audio
 * entry points before any application code runs, so these tests can assert on
 * what was played without listening to anything.
 */
interface AudioLog {
  decodes: number;
  starts: number;
  resumes: number;
  latencyHints: unknown[];
  state: () => string;
}

declare global {
  interface Window {
    __audio: AudioLog;
  }
}

async function instrumentAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    const log: Window['__audio'] = {
      decodes: 0,
      starts: 0,
      resumes: 0,
      latencyHints: [],
      state: () => contexts[0]?.state ?? 'none',
    };
    window.__audio = log;

    const RealContext = window.AudioContext;
    window.AudioContext = class extends RealContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
        log.latencyHints.push(options?.latencyHint);
      }
    };

    const decode = RealContext.prototype.decodeAudioData;
    RealContext.prototype.decodeAudioData = function (...args) {
      log.decodes += 1;
      return decode.apply(this, args);
    };

    const resume = RealContext.prototype.resume;
    RealContext.prototype.resume = function () {
      log.resumes += 1;
      return resume.call(this);
    };

    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      log.starts += 1;
      return start.apply(this, args);
    };
  });
}

async function audio(page: Page): Promise<Omit<AudioLog, 'state'> & { state: string }> {
  return await page.evaluate(() => ({
    decodes: window.__audio.decodes,
    starts: window.__audio.starts,
    resumes: window.__audio.resumes,
    latencyHints: window.__audio.latencyHints,
    state: window.__audio.state(),
  }));
}

/** The first cell the default groove leaves empty in a given lane. */
function silentCell(page: Page, instrument: 'hihat' | 'snare' | 'kick') {
  const step = defaultPattern().lanes[instrument].indexOf(false);
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

  const log = await audio(page);
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
  expect((await audio(page)).starts).toBe(1);

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  expect((await audio(page)).starts).toBe(1);
});

test('reuses the decoded buffers however many times a lane is played', async ({ page }) => {
  await page.goto('/');
  const cell = silentCell(page, 'hihat');
  await expect(cell).toBeEnabled();

  for (let i = 0; i < 3; i += 1) {
    await cell.click();
    await cell.click();
  }

  const log = await audio(page);
  expect(log.starts).toBe(3);
  expect(log.decodes).toBe(INSTRUMENTS.length);
});

test('wakes the audio context on the first press', async ({ page }) => {
  await page.goto('/');
  const cell = silentCell(page, 'kick');
  await expect(cell).toBeEnabled();

  const before = await audio(page);
  expect(before.state).toBe('suspended');

  await cell.click();

  await expect.poll(async () => (await audio(page)).state).toBe('running');
  expect((await audio(page)).resumes).toBeGreaterThanOrEqual(1);
});
