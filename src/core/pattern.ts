/** The pattern document: pure immutable value. No Svelte, DOM or notation lib. */

export const BARS = 2;
export const STEPS_PER_BAR = 16;
export const STEPS_PER_BEAT = 4;

/** Derived — nothing hardcodes a step count. */
export const BEATS_PER_BAR = STEPS_PER_BAR / STEPS_PER_BEAT;
export const TOTAL_STEPS = BARS * STEPS_PER_BAR;

export const DEFAULT_TEMPO = 90;
/** Playable range, enforced here — not only in an input's attributes. */
export const MIN_TEMPO = 40;
export const MAX_TEMPO = 240;

export type InstrumentId = 'hihat' | 'snare' | 'kick';

/** Staff position as scientific pitch. Notation, not a sound. */
export type StaffPosition = string;

/** PAS noteheads: cross for cymbals, plain otherwise. */
export type NoteheadType = 'normal' | 'cross';

/** Hands up, feet down. */
export type VoiceId = 'hands' | 'feet';

export interface Instrument {
  readonly id: InstrumentId;
  readonly name: string;
  /** Row label, where the full name would cost the cells their width. Kept
   *  alongside the name, which is what gets read out. */
  readonly abbreviation: string;
  readonly voice: VoiceId;
  readonly position: StaffPosition;
  readonly notehead: NoteheadType;
}

/**
 * Ordered top-to-bottom by staff height, so grid and notation read as one.
 * PAS key positions; the top line stays free for a future ride cymbal.
 *
 * No sounds here: a sample is a build asset, so instrument→sample lives in the
 * audio adapter and this table stays pure.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 'hihat',
    name: 'Hi-hat',
    abbreviation: 'HH',
    voice: 'hands',
    position: 'g/5',
    notehead: 'cross',
  },
  {
    id: 'snare',
    name: 'Snare',
    abbreviation: 'SD',
    voice: 'hands',
    position: 'c/5',
    notehead: 'normal',
  },
  {
    id: 'kick',
    name: 'Kick',
    abbreviation: 'BD',
    voice: 'feet',
    position: 'f/4',
    notehead: 'normal',
  },
];

export interface VoiceStyle {
  readonly id: VoiceId;
  readonly stem: 'up' | 'down';
  /** Each voice rests at its own height, so rests never collide and the reader
   *  can tell whose silence it is. */
  readonly restPosition: StaffPosition;
}

/** In the order they are written into a measure. */
export const VOICES: readonly VoiceStyle[] = [
  { id: 'hands', stem: 'up', restPosition: 'd/5' },
  { id: 'feet', stem: 'down', restPosition: 'f/4' },
];

/** One flat lane per instrument, covering every step of the pattern. */
export type Lanes = Readonly<Record<InstrumentId, readonly boolean[]>>;

export interface Pattern {
  readonly tempo: number;
  readonly lanes: Lanes;
}

/** Bar-relative steps, repeated across the bars. */
type Groove = Readonly<Partial<Record<InstrumentId, readonly number[]>>>;

function patternFrom(groove: Groove): Pattern {
  const lanes = {} as Record<InstrumentId, readonly boolean[]>;
  for (const { id } of INSTRUMENTS) {
    const lane = new Array<boolean>(TOTAL_STEPS).fill(false);
    for (let bar = 0; bar < BARS; bar += 1) {
      for (const step of groove[id] ?? []) {
        lane[bar * STEPS_PER_BAR + step] = true;
      }
    }
    lanes[id] = lane;
  }
  return { tempo: DEFAULT_TEMPO, lanes };
}

const STEPS_PER_EIGHTH = STEPS_PER_BEAT / 2;

/** Bar-relative step of a one-based beat, optionally offset within it. */
function beatStep(beat: number, offset = 0): number {
  return (beat - 1) * STEPS_PER_BEAT + offset;
}

/** Straight eighth-note rock: what a first-time visitor lands on. */
const ROCK_GROOVE: Groove = {
  hihat: Array.from({ length: STEPS_PER_BAR / STEPS_PER_EIGHTH }, (_, i) => i * STEPS_PER_EIGHTH),
  snare: [beatStep(2), beatStep(4)],
  kick: [beatStep(1), beatStep(3, STEPS_PER_EIGHTH)],
};

export function emptyPattern(): Pattern {
  return patternFrom({});
}

export function defaultPattern(): Pattern {
  return patternFrom(ROCK_GROOVE);
}

/** The counting read off the grid: `1 e + a`, once per beat. */
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

/** Grid layout: bar blocks of labelled steps. Boundaries derived, so adding a
 *  bar is a data change. */
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

/** Bridge from a playing step to the measure it is read out of. */
export function barOfStep(step: number): number {
  return Math.floor(step / STEPS_PER_BAR);
}

export function isHit(pattern: Pattern, instrument: InstrumentId, step: number): boolean {
  return pattern.lanes[instrument][step] ?? false;
}

/** Everything written on one step, in row order. */
export function instrumentsAt(pattern: Pattern, step: number): InstrumentId[] {
  return INSTRUMENTS.filter(({ id }) => isHit(pattern, id, step)).map(({ id }) => id);
}

/**
 * Nearest playable tempo. Every route in — button, typed number, stored payload
 * — comes through here. Total: a non-number resolves to the default rather than
 * escaping as a NaN that poisons every duration derived from it.
 */
export function clampTempo(tempo: number): number {
  if (!Number.isFinite(tempo)) return DEFAULT_TEMPO;
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(tempo)));
}

/** Same groove, clamped tempo. Lanes shared, not copied. */
export function withTempo(pattern: Pattern, tempo: number): Pattern {
  return { ...pattern, tempo: clampTempo(tempo) };
}

/** Flips one cell into a new `Pattern`; input untouched. */
export function toggleStep(pattern: Pattern, instrument: InstrumentId, step: number): Pattern {
  const lane = pattern.lanes[instrument];
  return {
    ...pattern,
    lanes: { ...pattern.lanes, [instrument]: lane.with(step, !lane[step]) },
  };
}
