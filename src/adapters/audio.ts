/**
 * The only module that knows Web Audio exists. Makes no musical decisions: it
 * is handed an instrument and plays its sample. Everything browser-facing goes
 * through the injected `AudioContext`, so a node test can pass a stand-in.
 */

import hihatUrl from '../assets/samples/hihat.wav?url';
import kickUrl from '../assets/samples/kick.wav?url';
import snareUrl from '../assets/samples/snare.wav?url';

import type { InstrumentId } from '../core/pattern.js';

/** Build assets, so the bundler content-hashes them — nothing is fetched from a
 *  third-party URL at runtime. */
export const SAMPLE_URLS: Record<InstrumentId, string> = {
  hihat: hihatUrl,
  snare: snareUrl,
  kick: kickUrl,
};

/** How sample bytes are obtained. Injected so tests need no network. */
export type FetchSample = (url: string) => Promise<ArrayBuffer>;

export interface DrumKit {
  /** Resolves once every sample is decoded and the kit is playable. */
  readonly ready: Promise<void>;
  /** The audio clock — the only clock that says anything true about when a
   *  sound happens. Everything timed reads this, never a wall clock. */
  readonly now: number;
  /** Wakes the hardware. Contexts start suspended until a user gesture, so this
   *  belongs on the first press, not on load. */
  resume(): Promise<void>;
  /** Sounds an instrument now, or at a time on the audio clock. Handing the
   *  time to the hardware rather than a timer is what keeps playback steady. */
  play(instrument: InstrumentId, when?: number): void;
  /** Drops scheduled-but-unsounded hits; what is ringing rings out. */
  cancelPending(): void;
}

async function fetchSample(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  return await response.arrayBuffer();
}

/** Decodes each sample once; a fresh source node per hit, since a source node
 *  is single-use by spec and the buffer behind it is not. */
export function createDrumKit(
  context: AudioContext,
  sources: Record<InstrumentId, string> = SAMPLE_URLS,
  fetchBytes: FetchSample = fetchSample,
): DrumKit {
  const buffers = new Map<InstrumentId, AudioBuffer>();
  /** Hits handed over and not yet finished, so they can be dropped. */
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
