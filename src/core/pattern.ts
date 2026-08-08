/**
 * The pattern document: a pure, immutable value. No Svelte, no DOM, no
 * notation library — everything here is unit-testable in a node environment.
 */

/** Bars in the whole pattern. */
export const BARS = 2;
/** Sixteenth-note steps in one bar. */
export const STEPS_PER_BAR = 16;
/** Steps in one quarter-note beat. */
export const STEPS_PER_BEAT = 4;

/** Everything below is derived — no logic anywhere hardcodes a step count. */
export const BEATS_PER_BAR = STEPS_PER_BAR / STEPS_PER_BEAT;
export const TOTAL_STEPS = BARS * STEPS_PER_BAR;

export const DEFAULT_TEMPO = 90;

export type InstrumentId = 'hihat' | 'snare' | 'kick';

export interface Instrument {
  readonly id: InstrumentId;
  readonly name: string;
}

/**
 * The single instrument table. Order is top-to-bottom, matching each
 * instrument's height on the staff, so the grid and the notation read as one
 * instrument. Later phases hang staff position, notehead and sample here.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  { id: 'hihat', name: 'Hi-hat' },
  { id: 'snare', name: 'Snare' },
  { id: 'kick', name: 'Kick' },
];

/** One flat lane per instrument, covering every step in the whole pattern. */
export type Lanes = Readonly<Record<InstrumentId, readonly boolean[]>>;

export interface Pattern {
  readonly tempo: number;
  readonly lanes: Lanes;
}

export function emptyPattern(): Pattern {
  const lanes = {} as Record<InstrumentId, readonly boolean[]>;
  for (const { id } of INSTRUMENTS) {
    lanes[id] = new Array<boolean>(TOTAL_STEPS).fill(false);
  }
  return { tempo: DEFAULT_TEMPO, lanes };
}

/** The counting a drummer reads off the grid: `1 e + a`, once per beat. */
const COUNT_LABELS = ['e', '+', 'a'];

export interface GridStep {
  /** Absolute index into a lane. */
  readonly index: number;
  readonly label: string;
  readonly isBeatStart: boolean;
}

export interface GridBar {
  readonly index: number;
  readonly steps: readonly GridStep[];
}

/**
 * How the grid is laid out: bar blocks of labelled steps. Bar boundaries are
 * derived from the constants, so adding a bar is a data change.
 */
export function gridBars(): readonly GridBar[] {
  return Array.from({ length: BARS }, (_, barIndex) => ({
    index: barIndex,
    steps: Array.from({ length: STEPS_PER_BAR }, (_, stepInBar) => {
      const positionInBeat = stepInBar % STEPS_PER_BEAT;
      const beat = Math.floor(stepInBar / STEPS_PER_BEAT);
      return {
        index: barIndex * STEPS_PER_BAR + stepInBar,
        label: positionInBeat === 0 ? String(beat + 1) : COUNT_LABELS[positionInBeat - 1]!,
        isBeatStart: positionInBeat === 0,
      };
    }),
  }));
}

export function isStepFilled(pattern: Pattern, instrument: InstrumentId, step: number): boolean {
  return pattern.lanes[instrument][step] ?? false;
}

/**
 * Flips one cell, producing a new `Pattern`. Non-destructive array update, so
 * the input value — and every lane other than the one touched — is unchanged.
 */
export function toggleStep(pattern: Pattern, instrument: InstrumentId, step: number): Pattern {
  const lane = pattern.lanes[instrument];
  return {
    ...pattern,
    lanes: { ...pattern.lanes, [instrument]: lane.with(step, !lane[step]) },
  };
}
