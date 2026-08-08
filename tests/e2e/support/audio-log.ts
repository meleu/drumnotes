import type { Page } from '@playwright/test';

/**
 * What the page did to the audio hardware. Recorded by wrapping the Web Audio
 * entry points before any application code runs, so the browser tests can
 * assert on what was played without listening to anything.
 */
export interface AudioLog {
  decodes: number;
  /** One entry per hit handed to the hardware: the time it was given, if any. */
  starts: (number | undefined)[];
  resumes: number;
  stops: number;
  latencyHints: unknown[];
  state: string;
}

interface PageLog extends Omit<AudioLog, 'state'> {
  state: () => string;
}

declare global {
  interface Window {
    __audio: PageLog;
  }
}

/** Installs the recording. Call before navigating. */
export async function instrumentAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    const log: PageLog = {
      decodes: 0,
      starts: [],
      resumes: 0,
      stops: 0,
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
      log.starts.push(args[0]);
      return start.apply(this, args);
    };

    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args) {
      log.stops += 1;
      return stop.apply(this, args);
    };
  });
}

/** Reads the recording out of the page. */
export async function audioLog(page: Page): Promise<AudioLog> {
  return await page.evaluate(() => ({
    decodes: window.__audio.decodes,
    starts: window.__audio.starts,
    resumes: window.__audio.resumes,
    stops: window.__audio.stops,
    latencyHints: window.__audio.latencyHints,
    state: window.__audio.state(),
  }));
}
