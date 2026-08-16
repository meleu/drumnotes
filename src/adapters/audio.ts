/**
 * The only module that knows Web Audio — and filenames — exist. No musical
 * decisions: given an instrument and a rung, it plays that recording. All
 * browser-facing work goes through the injected `AudioContext`, so a node test
 * can pass a stand-in.
 */

import hihatHardUrl from '../assets/samples/GMRockKit/HatClosed-Hard.wav?url';
import hihatHardestUrl from '../assets/samples/GMRockKit/HatClosed-Hardest.wav?url';
import hihatPlainUrl from '../assets/samples/GMRockKit/HatClosed-Soft.wav?url';
import hihatSoftestUrl from '../assets/samples/GMRockKit/HatClosed-Softest.wav?url';
import kickHardUrl from '../assets/samples/GMRockKit/Kick-Hard.wav?url';
import kickHardestUrl from '../assets/samples/GMRockKit/Kick-Hardest.wav?url';
import kickPlainUrl from '../assets/samples/GMRockKit/Kick-Med.wav?url';
import kickSoftestUrl from '../assets/samples/GMRockKit/Kick-Softest.wav?url';
import snareHardUrl from '../assets/samples/GMRockKit/Snare-Hard.wav?url';
import snareHardestUrl from '../assets/samples/GMRockKit/Snare-Hardest.wav?url';
import snarePlainUrl from '../assets/samples/GMRockKit/Snare-Med.wav?url';
import snareSoftestUrl from '../assets/samples/GMRockKit/Snare-Softest.wav?url';

import type { Dynamic, InstrumentId } from '../core/pattern.js';

export type SampleSet = Readonly<Record<Dynamic, string>>;

/**
 * Which recording each rung reads. Imported one at a time, not globbed, so only
 * soundable files reach the bundle — the kit is committed whole, the build
 * carries the subset.
 *
 * Hi-hat's plain rung is `-Soft`, not `-Med` like the rest: at `-Med` it sits on
 * top of the groove. A fact about these recordings; it stops here.
 */
export const SAMPLE_URLS: Readonly<Record<InstrumentId, SampleSet>> = {
  hihat: {
    softest: hihatSoftestUrl,
    plain: hihatPlainUrl,
    hard: hihatHardUrl,
    hardest: hihatHardestUrl,
  },
  snare: {
    softest: snareSoftestUrl,
    plain: snarePlainUrl,
    hard: snareHardUrl,
    hardest: snareHardestUrl,
  },
  kick: {
    softest: kickSoftestUrl,
    plain: kickPlainUrl,
    hard: kickHardUrl,
    hardest: kickHardestUrl,
  },
};

/** How sample bytes are obtained. Injected so tests need no network. */
export type FetchSample = (url: string) => Promise<ArrayBuffer>;

export interface DrumKit {
  /** Resolves once every sample is decoded and the kit is playable. */
  readonly ready: Promise<void>;
  /** The audio clock — the only true clock for when a sound happens. Everything
   *  timed reads this, never a wall clock. */
  readonly now: number;
  /** Wakes the hardware. Contexts start suspended until a user gesture, so call
   *  on first press, not on load. */
  resume(): Promise<void>;
  /** Sounds an instrument at a rung, now or at an audio-clock time. Handing the
   *  time to hardware, not a timer, is what keeps playback steady. A rung is a
   *  recording, never a gain: nothing here scales (ADR 0006). */
  play(instrument: InstrumentId, dynamic: Dynamic, when?: number): void;
  /** Drops scheduled-but-unsounded hits; what rings, rings out. */
  cancelPending(): void;
}

/** One decoded recording, addressed as asked for. */
type SampleKey = `${InstrumentId}:${Dynamic}`;

function keyOf(instrument: InstrumentId, dynamic: Dynamic): SampleKey {
  return `${instrument}:${dynamic}`;
}

async function fetchSample(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  return await response.arrayBuffer();
}

/** Decodes each sample once; fresh source node per hit, since source nodes are
 *  single-use by spec and buffers are not. */
export function createDrumKit(
  context: AudioContext,
  sources: Readonly<Record<InstrumentId, SampleSet>> = SAMPLE_URLS,
  fetchBytes: FetchSample = fetchSample,
): DrumKit {
  const buffers = new Map<SampleKey, AudioBuffer>();
  /** Handed-over, unfinished hits, so they can be dropped. */
  const sounding = new Map<AudioBufferSourceNode, number>();

  const ready = Promise.all(
    Object.entries(sources).flatMap(([id, rungs]) =>
      Object.entries(rungs).map(async ([dynamic, url]) => {
        const bytes = await fetchBytes(url);
        buffers.set(
          keyOf(id as InstrumentId, dynamic as Dynamic),
          await context.decodeAudioData(bytes),
        );
      }),
    ),
  ).then(() => undefined);

  return {
    ready,

    get now(): number {
      return context.currentTime;
    },

    async resume(): Promise<void> {
      if (context.state !== 'running') await context.resume();
    },

    play(instrument: InstrumentId, dynamic: Dynamic, when?: number): void {
      const buffer = buffers.get(keyOf(instrument, dynamic));
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
