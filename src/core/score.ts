/**
 * The `Score` intermediate representation, and the translation from a
 * `Pattern` into it.
 *
 * This is where every musical decision is made — what note value a hit gets,
 * which voice it belongs to, where it sits on the staff, what is beamed
 * together — and it is plain data, so all of it is unit-testable in a node
 * environment. Nothing here imports Svelte, the DOM or the notation library;
 * the renderer downstream makes no musical decisions of its own.
 *
 * The rhythm rule is one sentence, applied to notes and to silence alike: a
 * symbol lasts until whatever its own voice plays next, or until the beat it
 * started on runs out, whichever comes first.
 */

import type { Instrument, NoteheadType, Pattern, StaffPosition, VoiceId } from './pattern.js';
import { BARS, INSTRUMENTS, STEPS_PER_BAR, STEPS_PER_BEAT, VOICES, isHit } from './pattern.js';

/**
 * The note values reachable on this grid. The beat ceiling — nothing outlasts a
 * quarter, crosses a beat or crosses a barline — keeps the list this short and
 * makes ties impossible. `whole` is the exception, and only ever as the rest
 * standing for a completely silent measure.
 */
export type Duration = 'whole' | 'quarter' | 'eighth' | 'sixteenth';

/** How many sixteenth steps each undotted value lasts, derived from the constants. */
const STEPS_PER_DURATION: Readonly<Record<Duration, number>> = {
  whole: STEPS_PER_BAR,
  quarter: STEPS_PER_BEAT,
  eighth: STEPS_PER_BEAT / 2,
  sixteenth: STEPS_PER_BEAT / 4,
};

/** One head of a stroke: where it sits, and what shape it is drawn with. */
export interface Notehead {
  readonly position: StaffPosition;
  readonly type: NoteheadType;
}

/**
 * What one voice strikes on one step, low to high. A hi-hat and a snare struck
 * together are a single stroke, which is why they come out on one stem: the
 * voice plays one thing there, not two.
 */
type Stroke = readonly Notehead[];

interface BaseEntry {
  /** Absolute step index into the pattern's lanes — the entry's identity. */
  readonly startStep: number;
  readonly duration: Duration;
  readonly dots: number;
}

export interface NoteEntry extends BaseEntry {
  readonly kind: 'note';
  /** Simultaneous hits in one voice are one chord on one stem, low to high. */
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
  /**
   * Beams as lists of indices into `entries`. Grouping is decided here, never
   * by the renderer, which reads this list and draws exactly what it says.
   */
  readonly beamGroups: readonly (readonly number[])[];
}

export interface Measure {
  readonly index: number;
  /** Always both voices, in `VOICES` order: hands first, then feet. */
  readonly voices: readonly ScoreVoice[];
}

export interface Score {
  readonly measures: readonly Measure[];
}

/** A note value, as the pair the IR carries it: a base duration and its dots. */
interface NoteValue {
  readonly duration: Duration;
  readonly dots: number;
}

/** How many steps a value occupies. Each dot adds half of what came before it. */
function valueSteps({ duration, dots }: NoteValue): number {
  let steps = STEPS_PER_DURATION[duration];
  let dotted = steps;
  for (let dot = 0; dot < dots; dot += 1) {
    dotted /= 2;
    steps += dotted;
  }
  return steps;
}

/** How many steps an entry occupies, dots included. */
export function entrySteps(entry: Entry): number {
  return valueSteps(entry);
}

/**
 * Every value that fits inside a beat, keyed by its length in steps. The beat
 * ceiling is what keeps this table total and unambiguous: no length within a
 * beat has two spellings, and none is unspellable, so nothing ever needs a tie.
 *
 * Built from the vocabulary rather than written out, so the table follows the
 * constants if the grid's resolution ever changes.
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

/**
 * Instruments bottom-to-top. The table is written top-to-bottom to match the
 * grid's row order, and a chord's heads have to read low to high, so the one
 * ordering is derived from the other rather than duplicated.
 */
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
 * Which values a beam can join. Quarters and the whole rest carry no flag to
 * replace, so there is nothing for a beam to do to them; a dot changes a note's
 * length but not the flag it is drawn with, so dotted values beam like their
 * undotted counterparts.
 */
const BEAMABLE: ReadonlySet<Duration> = new Set<Duration>(['eighth', 'sixteenth']);

/** Beams replace flags, and only notes carry flags — a rest is never beamed. */
function isBeamable(entry: Entry): boolean {
  return entry.kind === 'note' && BEAMABLE.has(entry.duration);
}

/** What a voice contributes to a measure: what is written, and what is joined. */
type VoiceContent = Pick<ScoreVoice, 'entries' | 'beamGroups'>;

/**
 * One voice's measure, filled end to end: every step is either a hit or a rest,
 * so each voice accounts for the whole measure on its own and neither depends
 * on what the other is playing.
 */
function voiceContent(
  pattern: Pattern,
  measure: number,
  voice: VoiceId,
  restPosition: StaffPosition,
): VoiceContent {
  const instruments = INSTRUMENTS_LOW_TO_HIGH.filter((instrument) => instrument.voice === voice);

  const firstStep = measure * STEPS_PER_BAR;
  // Each step of the measure holds this voice's stroke there, or nothing at all:
  // silence is the absence of a stroke, never a stroke of nothing.
  const strokes = Array.from({ length: STEPS_PER_BAR }, (_, stepInBar) =>
    strokeAt(pattern, instruments, firstStep + stepInBar),
  );

  // A voice that never plays is written as one whole rest rather than four
  // quarter rests — the conventional spelling for an empty measure. It carries
  // this voice's rest position, so it does not land on the renderer's default.
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

  // One beat at a time, so nothing can be written across a beat boundary — and
  // since beats tile the measure, nothing can cross the barline either. Beams
  // are gathered inside the same loop, which is what keeps a beam from spanning
  // a beat: a group can only ever hold what one pass put into it.
  for (let beatStart = 0; beatStart < STEPS_PER_BAR; beatStart += STEPS_PER_BEAT) {
    const beatEnd = beatStart + STEPS_PER_BEAT;
    const beatFirstEntry = entries.length;

    for (let stepInBar = beatStart; stepInBar < beatEnd;) {
      // Notes and silence obey the same rule: hold until this voice's next
      // stroke, or until the beat runs out, whichever comes first.
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

    // A beam is a way of writing two or more flags as one line; a lone flagged
    // note has nothing to be joined to, so it keeps its flag and no group is
    // recorded for the beat at all.
    const group = entries
      .slice(beatFirstEntry)
      .flatMap((entry, offset) => (isBeamable(entry) ? [beatFirstEntry + offset] : []));
    if (group.length > 1) beamGroups.push(group);
  }

  return { entries, beamGroups };
}

/**
 * What this voice strikes on one step, or nothing where it does not play there.
 * Heads come out low to high, which is the order a chord has to be written in.
 */
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
