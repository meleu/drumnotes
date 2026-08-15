/**
 * The only module that knows Web Audio exists, and the only module that knows a
 * filename. Makes no musical decisions: it is handed an instrument and a rung
 * and plays the recording of it. Everything browser-facing goes through the
 * injected `AudioContext`, so a node test can pass a stand-in.
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

/** Every rung of one instrument. */
export type SampleSet = Readonly<Record<Dynamic, string>>;

/**
 * Which recording each rung reads. Named one import at a time rather than
 * globbed, so only the files the app can actually sound reach the bundle — the
 * kit is committed whole, the build carries the subset.
 *
 * The closed hi-hat's plain rung is `-Soft`, not the `-Med` every other
 * instrument uses: at `-Med` it sits on top of the groove instead of under it.
 * That is a fact about these recordings and it stops here — the core asks for
 * `plain` and has no way to learn about it.
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
  /** The audio clock — the only clock that says anything true about when a
   *  sound happens. Everything timed reads this, never a wall clock. */
  readonly now: number;
  /** Wakes the hardware. Contexts start suspended until a user gesture, so this
   *  belongs on the first press, not on load. */
  resume(): Promise<void>;
  /** Sounds an instrument at a rung, now or at a time on the audio clock.
   *  Handing the time to the hardware rather than a timer is what keeps
   *  playback steady. A rung is a recording, never a gain: nothing here scales
   *  anything (ADR 0006). */
  play(instrument: InstrumentId, dynamic: Dynamic, when?: number): void;
  /** Drops scheduled-but-unsounded hits; what is ringing rings out. */
  cancelPending(): void;
}

/** One decoded recording, addressed the way it is asked for. */
type SampleKey = `${InstrumentId}:${Dynamic}`;

function keyOf(instrument: InstrumentId, dynamic: Dynamic): SampleKey {
  return `${instrument}:${dynamic}`;
}

async function fetchSample(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  return await response.arrayBuffer();
}

/** Decodes each sample once; a fresh source node per hit, since a source node
 *  is single-use by spec and the buffer behind it is not. */
export function createDrumKit(
  context: AudioContext,
  sources: Readonly<Record<InstrumentId, SampleSet>> = SAMPLE_URLS,
  fetchBytes: FetchSample = fetchSample,
): DrumKit {
  const buffers = new Map<SampleKey, AudioBuffer>();
  /** Hits handed over and not yet finished, so they can be dropped. */
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
