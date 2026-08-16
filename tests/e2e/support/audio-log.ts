import type { Page } from '@playwright/test';

/**
 * What the page did to the audio hardware. Recorded by wrapping the Web Audio
 * entry points before any app code runs, so tests can assert on what was played
 * without listening.
 */
export interface AudioLog {
  decodes: number;
  /** One entry per hit handed over: the time it was given, if any. */
  starts: (number | undefined)[];
  /** One entry per hit handed over, alongside `starts`: which recording it
   *  sounded, named as the kit names it and stripped of the build's hash. */
  samples: string[];
  /** One entry per hit handed over, alongside `starts`: where the audio clock
   *  stood as it was handed over, so a moment still to come can be told from
   *  one that has already gone by. */
  clocks: number[];
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
    /* Which file each decoded buffer came from, carried across the two steps
       that separate a url from a sound: fetch → decode → play. */
    const urlOfBytes = new WeakMap<ArrayBuffer, string>();
    const urlOfBuffer = new WeakMap<AudioBuffer, string>();

    /** `/assets/Snare-Hardest-a1b2c3d4.wav` → `Snare-Hardest`. */
    const sampleName = (url: string | undefined): string =>
      url === undefined
        ? 'unknown'
        : (url.split('/').at(-1) ?? '').replace(/\.wav$/, '').replace(/-[A-Za-z0-9_-]{8}$/, '');

    const log: PageLog = {
      decodes: 0,
      starts: [],
      samples: [],
      clocks: [],
      resumes: 0,
      stops: 0,
      latencyHints: [],
      state: () => contexts[0]?.state ?? 'none',
    };
    window.__audio = log;

    const realFetch = window.fetch;
    window.fetch = async function (input, init) {
      const response = await realFetch.call(this, input, init);
      const url = typeof input === 'string' ? input : new Request(input).url;
      const bytes = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => {
        const buffer = await bytes();
        urlOfBytes.set(buffer, url);
        return buffer;
      };
      return response;
    };

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
      // Decoding detaches the bytes, so read the url off them first.
      const url = urlOfBytes.get(args[0]);
      return decode.apply(this, args).then((buffer) => {
        if (url !== undefined) urlOfBuffer.set(buffer, url);
        return buffer;
      });
    };

    const resume = RealContext.prototype.resume;
    RealContext.prototype.resume = function () {
      log.resumes += 1;
      return resume.call(this);
    };

    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      log.starts.push(args[0]);
      log.samples.push(sampleName(this.buffer ? urlOfBuffer.get(this.buffer) : undefined));
      log.clocks.push(this.context.currentTime);
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
    samples: window.__audio.samples,
    clocks: window.__audio.clocks,
    resumes: window.__audio.resumes,
    stops: window.__audio.stops,
    latencyHints: window.__audio.latencyHints,
    state: window.__audio.state(),
  }));
}
