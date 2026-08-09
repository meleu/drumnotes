/**
 * The `Score` IR, and the translation from a `Pattern` into it.
 *
 * Every musical decision — note values, voices, staff positions, beaming — is
 * made here, as plain data. No Svelte, DOM or notation lib; the renderer
 * downstream decides nothing musical.
 *
 * The rhythm rule, for notes and silence alike: a symbol lasts until its own
 * voice plays next, or until its beat runs out, whichever comes first.
 */

import type { Instrument, NoteheadType, Pattern, StaffPosition, VoiceId } from './pattern.js';
import { BARS, INSTRUMENTS, STEPS_PER_BAR, STEPS_PER_BEAT, VOICES, isHit } from './pattern.js';

/**
 * Note values reachable on this grid. The beat ceiling — nothing outlasts a
 * quarter or crosses a beat — keeps the list short and makes ties impossible.
 * `whole` only ever spells a completely silent measure's rest.
 */
export type Duration = 'whole' | 'quarter' | 'eighth' | 'sixteenth';

/** Steps per undotted value, derived from the constants. */
const STEPS_PER_DURATION: Readonly<Record<Duration, number>> = {
  whole: STEPS_PER_BAR,
  quarter: STEPS_PER_BEAT,
  eighth: STEPS_PER_BEAT / 2,
  sixteenth: STEPS_PER_BEAT / 4,
};

/** One head of a stroke: where it sits, what shape it is drawn with. */
export interface Notehead {
  readonly position: StaffPosition;
  readonly type: NoteheadType;
}

/** What one voice strikes on one step, low to high — one stroke, one stem. */
type Stroke = readonly Notehead[];

interface BaseEntry {
  /** Absolute step index into the lanes — the entry's identity. */
  readonly startStep: number;
  readonly duration: Duration;
  readonly dots: number;
}

export interface NoteEntry extends BaseEntry {
  readonly kind: 'note';
  /** Simultaneous hits in one voice: one chord on one stem, low to high. */
  readonly noteheads: readonly Notehead[];
}

export interface RestEntry extends BaseEntry {
  readonly kind: 'rest';
  readonly position: StaffPosition;
}

export type Entry = NoteEntry | RestEntry;

export interface ScoreVoice {
  readonly id: VoiceId;
  readonly stem: 'up' | 'down';
  readonly entries: readonly Entry[];
  /** Beams as indices into `entries`. Grouping decided here; the renderer draws
   *  exactly what this says. */
  readonly beamGroups: readonly (readonly number[])[];
}

export interface Measure {
  readonly index: number;
  /** Always both voices, in `VOICES` order. */
  readonly voices: readonly ScoreVoice[];
}

export interface Score {
  readonly measures: readonly Measure[];
}

/** A note value: base duration plus dots. */
interface NoteValue {
  readonly duration: Duration;
  readonly dots: number;
}

/** Steps a value occupies. Each dot adds half of what came before. */
function valueSteps({ duration, dots }: NoteValue): number {
  let steps = STEPS_PER_DURATION[duration];
  let dotted = steps;
  for (let dot = 0; dot < dots; dot += 1) {
    dotted /= 2;
    steps += dotted;
  }
  return steps;
}

export function entrySteps(entry: Entry): number {
  return valueSteps(entry);
}

/**
 * Every value fitting inside a beat, keyed by length in steps. The beat ceiling
 * keeps this total and unambiguous — one spelling per length, none unspellable,
 * so nothing ever needs a tie. Built from the vocabulary so it follows the
 * constants if the grid's resolution changes.
 */
const VALUES_BY_STEPS: ReadonlyMap<number, NoteValue> = new Map(
  (['quarter', 'eighth', 'sixteenth'] as const)
    .flatMap((duration) => [0, 1].map((dots) => ({ duration, dots })))
    .map((value) => [valueSteps(value), value] as const)
    .filter(([steps]) => Number.isInteger(steps) && steps <= STEPS_PER_BEAT),
);

function valueSpanning(steps: number): NoteValue {
  const value = VALUES_BY_STEPS.get(steps);
  if (!value) throw new Error(`no note value spans ${steps} steps`);
  return value;
}

/** Derived from the top-to-bottom table, since a chord reads low to high. */
const INSTRUMENTS_LOW_TO_HIGH = [...INSTRUMENTS].reverse();

export function toScore(pattern: Pattern): Score {
  return {
    measures: Array.from({ length: BARS }, (_, index) => ({
      index,
      voices: VOICES.map((voice) => ({
        id: voice.id,
        stem: voice.stem,
        ...voiceContent(pattern, index, voice.id, voice.restPosition),
      })),
    })),
  };
}

/**
 * What a beam can join. Quarters and the whole rest carry no flag to replace; a
 * dot changes length but not the flag, so dotted values beam like undotted.
 */
const BEAMABLE: ReadonlySet<Duration> = new Set<Duration>(['eighth', 'sixteenth']);

/** Beams replace flags, and only notes carry flags. */
function isBeamable(entry: Entry): boolean {
  return entry.kind === 'note' && BEAMABLE.has(entry.duration);
}

type VoiceContent = Pick<ScoreVoice, 'entries' | 'beamGroups'>;

/**
 * One voice's measure, filled end to end: every step is a hit or a rest, so each
 * voice accounts for the whole measure independently of the other.
 */
function voiceContent(
  pattern: Pattern,
  measure: number,
  voice: VoiceId,
  restPosition: StaffPosition,
): VoiceContent {
  const instruments = INSTRUMENTS_LOW_TO_HIGH.filter((instrument) => instrument.voice === voice);

  const firstStep = measure * STEPS_PER_BAR;
  // Each step holds this voice's stroke there, or nothing: silence is the
  // absence of a stroke, never a stroke of nothing.
  const strokes = Array.from({ length: STEPS_PER_BAR }, (_, stepInBar) =>
    strokeAt(pattern, instruments, firstStep + stepInBar),
  );

  // Conventional spelling for an empty measure: one whole rest, not four
  // quarters — at this voice's rest position, not the renderer's default.
  if (strokes.every((stroke) => stroke === undefined)) {
    return {
      entries: [
        { kind: 'rest', startStep: firstStep, duration: 'whole', dots: 0, position: restPosition },
      ],
      beamGroups: [],
    };
  }

  const entries: Entry[] = [];
  const beamGroups: number[][] = [];

  // One beat at a time, so nothing crosses a beat boundary — and since beats
  // tile the measure, nothing crosses the barline. Beams gathered in the same
  // pass, which is what keeps a beam inside one beat.
  for (let beatStart = 0; beatStart < STEPS_PER_BAR; beatStart += STEPS_PER_BEAT) {
    const beatEnd = beatStart + STEPS_PER_BEAT;
    const beatFirstEntry = entries.length;

    for (let stepInBar = beatStart; stepInBar < beatEnd;) {
      // Notes and silence alike: hold until this voice's next stroke, or until
      // the beat runs out.
      let next = stepInBar + 1;
      while (next < beatEnd && strokes[next] === undefined) next += 1;

      const stroke = strokes[stepInBar];
      const startStep = firstStep + stepInBar;
      const { duration, dots } = valueSpanning(next - stepInBar);

      entries.push(
        stroke !== undefined
          ? { kind: 'note', startStep, duration, dots, noteheads: stroke }
          : { kind: 'rest', startStep, duration, dots, position: restPosition },
      );
      stepInBar = next;
    }

    // A lone flagged note has nothing to join, so it keeps its flag and no group
    // is recorded.
    const group = entries
      .slice(beatFirstEntry)
      .flatMap((entry, offset) => (isBeamable(entry) ? [beatFirstEntry + offset] : []));
    if (group.length > 1) beamGroups.push(group);
  }

  return { entries, beamGroups };
}

/** What this voice strikes on one step, low to high, or nothing. */
function strokeAt(
  pattern: Pattern,
  instruments: readonly Instrument[],
  step: number,
): Stroke | undefined {
  const heads = instruments
    .filter((instrument) => isHit(pattern, instrument.id, step))
    .map(({ position, notehead }) => ({ position, type: notehead }));
  return heads.length > 0 ? heads : undefined;
}
