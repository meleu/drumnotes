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
/** The playable tempo range. Enforced here, never only in an input's attributes. */
export const MIN_TEMPO = 40;
export const MAX_TEMPO = 240;

export type InstrumentId = 'hihat' | 'snare' | 'kick';

/**
 * Where a symbol sits on the staff, as scientific pitch. A position, not a
 * sound: this is notation vocabulary, not a note anyone plays.
 */
export type StaffPosition = string;

/** Percussive Arts Society noteheads: a cross for cymbals, a plain head otherwise. */
export type NoteheadType = 'normal' | 'cross';

/** Which of the two voices an instrument is written in — hands up, feet down. */
export type VoiceId = 'hands' | 'feet';

export interface Instrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly voice: VoiceId;
  readonly position: StaffPosition;
  readonly notehead: NoteheadType;
}

/**
 * The single instrument table. Order is top-to-bottom, matching each
 * instrument's height on the staff, so the grid and the notation read as one
 * instrument. Positions follow the Percussive Arts Society key: closed hi-hat
 * in the space above the top line, snare in the third space, bass drum in the
 * first space. The top line itself stays free for a future ride cymbal.
 *
 * Sounds are deliberately absent: a sample is a bundled asset with a build-time
 * URL, so the table pairing an instrument with its sample lives in the audio
 * adapter and this one stays pure.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  { id: 'hihat', name: 'Hi-hat', voice: 'hands', position: 'g/5', notehead: 'cross' },
  { id: 'snare', name: 'Snare', voice: 'hands', position: 'c/5', notehead: 'normal' },
  { id: 'kick', name: 'Kick', voice: 'feet', position: 'f/4', notehead: 'normal' },
];

export interface VoiceStyle {
  readonly id: VoiceId;
  readonly stem: 'up' | 'down';
  /**
   * Where this voice's rests are written. Each voice rests at its own height so
   * the two never collide, and so a reader can tell at a glance whose silence
   * it is — which is why rests carry a position rather than taking the
   * renderer's default.
   */
  readonly restPosition: StaffPosition;
}

/** The two voices, in the order they are written into a measure. */
export const VOICES: readonly VoiceStyle[] = [
  { id: 'hands', stem: 'up', restPosition: 'd/5' },
  { id: 'feet', stem: 'down', restPosition: 'f/4' },
];

/** One flat lane per instrument, covering every step in the whole pattern. */
export type Lanes = Readonly<Record<InstrumentId, readonly boolean[]>>;

export interface Pattern {
  readonly tempo: number;
  readonly lanes: Lanes;
}

/** A groove written once as bar-relative steps, then repeated across the bars. */
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

/** Straight eighth-note rock beat: the groove a first-time visitor lands on. */
const ROCK_BEAT: Groove = {
  hihat: Array.from({ length: STEPS_PER_BAR / STEPS_PER_EIGHTH }, (_, i) => i * STEPS_PER_EIGHTH),
  snare: [beatStep(2), beatStep(4)],
  kick: [beatStep(1), beatStep(3, STEPS_PER_EIGHTH)],
};

export function emptyPattern(): Pattern {
  return patternFrom({});
}

export function defaultPattern(): Pattern {
  return patternFrom(ROCK_BEAT);
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
 * Everything written on one step, in the table's top-to-bottom order — what the
 * player has to strike when the playhead arrives there.
 */
export function instrumentsAt(pattern: Pattern, step: number): InstrumentId[] {
  return INSTRUMENTS.filter(({ id }) => isStepFilled(pattern, id, step)).map(({ id }) => id);
}

/**
 * The nearest playable tempo to the one asked for. Every route in — a button,
 * a typed number, a stored payload — comes through here, so nothing downstream
 * ever has to wonder whether a tempo is playable. Total by design: a number
 * that is no number at all resolves to the default rather than escaping as a
 * `NaN` that would silently poison every duration derived from it.
 */
export function clampTempo(tempo: number): number {
  if (!Number.isFinite(tempo)) return DEFAULT_TEMPO;
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(tempo)));
}

/** The same groove at another tempo, clamped. Lanes are shared, not copied. */
export function withTempo(pattern: Pattern, tempo: number): Pattern {
  return { ...pattern, tempo: clampTempo(tempo) };
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
