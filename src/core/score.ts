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
 * This phase writes deliberately naive rhythm: every hit is a sixteenth and
 * every gap a sixteenth rest. The structure around it — voices, chords, stems,
 * positions, measure filling — is final.
 */

import type { InstrumentId, NoteheadType, Pattern, StaffPosition, VoiceId } from './pattern.js';
import { BARS, INSTRUMENTS, STEPS_PER_BAR, STEPS_PER_BEAT, VOICES } from './pattern.js';

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

/** One head of a chord: where it sits, and what shape it is drawn with. */
export interface Notehead {
  readonly position: StaffPosition;
  readonly type: NoteheadType;
}

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
   * by the renderer. Empty until the beaming phase.
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

/** How many steps an entry occupies, dots included. */
export function entrySteps(entry: Entry): number {
  let steps = STEPS_PER_DURATION[entry.duration];
  let dotted = steps;
  for (let dot = 0; dot < entry.dots; dot += 1) {
    dotted /= 2;
    steps += dotted;
  }
  return steps;
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
        entries: voiceEntries(pattern, index, voice.id, voice.restPosition),
        beamGroups: [],
      })),
    })),
  };
}

/**
 * One voice's measure, filled end to end: every step is either a hit or a rest,
 * so each voice accounts for the whole measure on its own and neither depends
 * on what the other is playing.
 */
function voiceEntries(
  pattern: Pattern,
  measure: number,
  voice: VoiceId,
  restPosition: StaffPosition,
): readonly Entry[] {
  const instruments = INSTRUMENTS_LOW_TO_HIGH.filter((instrument) => instrument.voice === voice);

  return Array.from({ length: STEPS_PER_BAR }, (_, stepInBar): Entry => {
    const startStep = measure * STEPS_PER_BAR + stepInBar;
    const noteheads = instruments
      .filter((instrument) => isHit(pattern, instrument.id, startStep))
      .map(({ position, notehead }) => ({ position, type: notehead }));

    return noteheads.length > 0
      ? { kind: 'note', startStep, duration: 'sixteenth', dots: 0, noteheads }
      : { kind: 'rest', startStep, duration: 'sixteenth', dots: 0, position: restPosition };
  });
}

function isHit(pattern: Pattern, instrument: InstrumentId, step: number): boolean {
  return pattern.lanes[instrument][step] ?? false;
}
