/**
 * The `Score` IR and `Pattern`→`Score` translation. Every musical decision —
 * note values, voices, positions, beaming — is made here as plain data; the
 * renderer decides nothing musical.
 *
 * Rhythm rule (notes and rests alike): a symbol lasts until its own voice plays
 * next, or its beat runs out, whichever comes first.
 */

import type {
  Articulation,
  Instrument,
  NoteheadType,
  Pattern,
  StaffPosition,
  VoiceId,
} from './pattern.js';
import {
  BARS,
  INSTRUMENTS,
  STEPS_PER_BAR,
  STEPS_PER_BEAT,
  VOICES,
  articulationAt,
  hitsOf,
} from './pattern.js';

/**
 * Note values reachable on this grid. Beat ceiling (nothing outlasts a quarter
 * or crosses a beat) keeps it short and makes ties impossible. `whole` only ever
 * spells a silent measure's rest.
 */
export type Duration = 'whole' | 'quarter' | 'eighth' | 'sixteenth';

/** Steps per undotted value, derived. */
const STEPS_PER_DURATION: Readonly<Record<Duration, number>> = {
  whole: STEPS_PER_BAR,
  quarter: STEPS_PER_BEAT,
  eighth: STEPS_PER_BEAT / 2,
  sixteenth: STEPS_PER_BEAT / 4,
};

/** One head of a stroke: position and shape. */
export interface Notehead {
  readonly position: StaffPosition;
  readonly type: NoteheadType;
  /** Ghosted. Per-head, unlike an accent: the parens say *which* drum. */
  readonly parenthesised: boolean;
}

/** One grace note: heads on the same slot, low to high, sharing a stem. */
export type GraceSlot = readonly Notehead[];

/** What one voice strikes on one step, low to high: one stroke, one stem. */
interface Stroke {
  readonly noteheads: readonly Notehead[];
  /** Accented. Per-stroke, not per-head: one stem takes one mark (ADR 0005). */
  readonly accented: boolean;
  /** Leading grace notes, earliest first; empty unless ornamented. They occupy
   *  no steps — a measure adds up without counting them. */
  readonly graces: readonly GraceSlot[];
}

interface BaseEntry {
  /** Absolute lane step index — the entry's identity. */
  readonly startStep: number;
  readonly duration: Duration;
  readonly dots: number;
}

export interface NoteEntry extends BaseEntry, Stroke {
  readonly kind: 'note';
  /** Simultaneous hits in one voice: one chord, one stem, low to high. */
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
  /** Beams as `entries` indices. Grouping decided here; renderer just draws. */
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

interface NoteValue {
  readonly duration: Duration;
  readonly dots: number;
}

/** Steps a value occupies; each dot adds half the previous. */
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
 * Every value fitting a beat, keyed by step length. Beat ceiling makes it total
 * and unambiguous — one spelling per length, so no ties. Built from the
 * constants, so it follows a resolution change.
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

/** Chords read low to high; the table is top to bottom. */
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
 * What a beam can join. Quarters/whole rests have no flag to replace; a dot
 * changes length not flag, so dotted beams like undotted.
 */
const BEAMABLE: ReadonlySet<Duration> = new Set<Duration>(['eighth', 'sixteenth']);

/** Beams replace flags; only notes have flags. */
function isBeamable(entry: Entry): boolean {
  return entry.kind === 'note' && BEAMABLE.has(entry.duration);
}

type VoiceContent = Pick<ScoreVoice, 'entries' | 'beamGroups'>;

/** One voice's measure, filled end to end — every step a hit or rest, so each
 *  voice accounts for the measure independently. */
function voiceContent(
  pattern: Pattern,
  measure: number,
  voice: VoiceId,
  restPosition: StaffPosition,
): VoiceContent {
  const instruments = INSTRUMENTS_LOW_TO_HIGH.filter((instrument) => instrument.voice === voice);

  const firstStep = measure * STEPS_PER_BAR;
  // Silence is the absence of a stroke, never a stroke of nothing.
  const strokes = Array.from({ length: STEPS_PER_BAR }, (_, stepInBar) =>
    strokeAt(pattern, instruments, firstStep + stepInBar),
  );

  // Empty measure: one whole rest at this voice's position, not four quarters.
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

  // One beat at a time: nothing crosses a beat, hence nor the barline. Beams
  // gathered in the same pass, which keeps each beam inside one beat.
  for (let beatStart = 0; beatStart < STEPS_PER_BAR; beatStart += STEPS_PER_BEAT) {
    const beatEnd = beatStart + STEPS_PER_BEAT;
    const beatFirstEntry = entries.length;

    for (let stepInBar = beatStart; stepInBar < beatEnd;) {
      // Hold until this voice's next stroke, or the beat's end.
      let next = stepInBar + 1;
      while (next < beatEnd && strokes[next] === undefined) next += 1;

      const stroke = strokes[stepInBar];
      const startStep = firstStep + stepInBar;
      const { duration, dots } = valueSpanning(next - stepInBar);

      entries.push(
        stroke !== undefined
          ? { kind: 'note', startStep, duration, dots, ...stroke }
          : { kind: 'rest', startStep, duration, dots, position: restPosition },
      );
      stepInBar = next;
    }

    // A lone flagged note keeps its flag; no group recorded.
    const group = entries
      .slice(beatFirstEntry)
      .flatMap((entry, offset) => (isBeamable(entry) ? [beatFirstEntry + offset] : []));
    if (group.length > 1) beamGroups.push(group);
  }

  return { entries, beamGroups };
}

/** One instrument's share of a stroke. */
interface Struck {
  readonly instrument: Instrument;
  readonly articulation: Articulation;
}

/**
 * What this voice strikes on one step, low to high, or nothing.
 *
 * A mark lands where its meaning does: an accent is the stroke's (a stem cannot
 * be half struck harder), a ghost's parens are one head's (they say which drum).
 */
function strokeAt(
  pattern: Pattern,
  instruments: readonly Instrument[],
  step: number,
): Stroke | undefined {
  const struck: Struck[] = instruments.map((instrument) => ({
    instrument,
    articulation: articulationAt(pattern, instrument.id, step),
  }));
  const heads = struck.filter(({ articulation }) => articulation !== 'empty');
  if (heads.length === 0) return undefined;

  return {
    noteheads: heads.map(({ instrument, articulation }) =>
      headOf(instrument, articulation === 'ghost'),
    ),
    accented: heads.some(({ articulation }) => articulation === 'accent'),
    graces: gracesOf(heads),
  };
}

function headOf(instrument: Instrument, parenthesised = false): Notehead {
  return { position: instrument.position, type: instrument.notehead, parenthesised };
}

/**
 * Grace notes leading into a stroke, earliest first. Read off each grace hit's
 * lead: equal leads share a slot and so a stem, drawing two ornamented drums as
 * one gesture. The word "flam" never reaches the page — a slot count does.
 */
function gracesOf(heads: readonly Struck[]): GraceSlot[] {
  const led = heads.flatMap(({ instrument, articulation }) =>
    hitsOf(articulation)
      .filter(({ leads }) => leads > 0)
      .map(({ leads }) => ({ instrument, leads })),
  );

  return [...new Set(led.map(({ leads }) => leads))]
    .sort((a, b) => b - a)
    .map((slot) =>
      led.filter(({ leads }) => leads === slot).map(({ instrument }) => headOf(instrument)),
    );
}
