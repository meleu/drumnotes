/**
 * The audio adapter: the only module that knows Web Audio exists.
 *
 * It makes no musical decisions either — it is handed an instrument and plays
 * that instrument's sample. Everything browser-facing is reached through the
 * `AudioContext` passed in, so the kit itself can be exercised in a node test
 * against a stand-in.
 */

import hihatUrl from '../assets/samples/hihat.wav?url';
import kickUrl from '../assets/samples/kick.wav?url';
import snareUrl from '../assets/samples/snare.wav?url';

import type { InstrumentId } from '../core/pattern.js';

/**
 * Where each instrument's sample lives. Imported as build assets so the bundler
 * content-hashes and copies them — nothing is fetched from a third-party URL at
 * runtime.
 */
export const SAMPLE_URLS: Record<InstrumentId, string> = {
  hihat: hihatUrl,
  snare: snareUrl,
  kick: kickUrl,
};

/** How the bytes of a sample are obtained. Injected so tests need no network. */
export type FetchSample = (url: string) => Promise<ArrayBuffer>;

export interface DrumKit {
  /** Resolves once every sample has been decoded and the kit can be played. */
  readonly ready: Promise<void>;
  /**
   * The audio clock: the only clock that says anything true about when a sound
   * happens. Everything timed reads this rather than a wall clock.
   */
  readonly now: number;
  /**
   * Wakes the audio hardware. Browsers start a context suspended until a user
   * gesture, so this belongs on the first press rather than on load.
   */
  resume(): Promise<void>;
  /**
   * Sounds one instrument — at once by default, or at a given time on the audio
   * clock. Handing the time to the hardware rather than to a timer is what
   * makes playback steady.
   */
  play(instrument: InstrumentId, when?: number): void;
  /**
   * Drops the hits that were scheduled but have not sounded yet. Whatever is
   * already ringing is left to ring out: stopping playback should silence what
   * is coming, not chop off the note under the finger.
   */
  cancelPending(): void;
}

async function fetchSample(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  return await response.arrayBuffer();
}

/**
 * Decodes each sample once into a buffer and plays it through a fresh source
 * node per hit — a source node is single-use by specification, the buffer
 * behind it is not.
 */
export function createDrumKit(
  context: AudioContext,
  sources: Record<InstrumentId, string> = SAMPLE_URLS,
  fetchBytes: FetchSample = fetchSample,
): DrumKit {
  const buffers = new Map<InstrumentId, AudioBuffer>();
  /** Hits handed to the hardware and not yet finished, so they can be dropped. */
  const sounding = new Map<AudioBufferSourceNode, number>();

  const ready = Promise.all(
    Object.entries(sources).map(async ([id, url]) => {
      const bytes = await fetchBytes(url);
      buffers.set(id as InstrumentId, await context.decodeAudioData(bytes));
    }),
  ).then(() => undefined);

  return {
    ready,

    get now(): number {
      return context.currentTime;
    },

    async resume(): Promise<void> {
      if (context.state !== 'running') await context.resume();
    },

    play(instrument: InstrumentId, when?: number): void {
      const buffer = buffers.get(instrument);
      if (!buffer) return;

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      sounding.set(source, when ?? context.currentTime);
      source.onended = () => sounding.delete(source);
      source.start(when);
    },

    cancelPending(): void {
      for (const [source, when] of sounding) {
        if (when > context.currentTime) source.stop();
      }
    },
  };
}
