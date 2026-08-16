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

/**
 * How a cell is struck — one value and never two, so an accented flam is
 * unwritable (ADR 0005). `empty` is the whole of silence: rubbing a cell out
 * takes its articulation with it.
 *
 * Ordered as the menu offers them, silence first.
 */
export const ARTICULATIONS = ['empty', 'normal', 'accent', 'ghost', 'flam', 'drag'] as const;

export type Articulation = (typeof ARTICULATIONS)[number];

/** What a tap writes, and what every cell of the landing groove holds. */
const PLAIN: Articulation = 'normal';

export interface ArticulationChoice {
  readonly id: Articulation;
  /** What the menu calls it, and what a screen reader reads out. */
  readonly name: string;
  /**
   * The SMuFL character a cell holding this is drawn with — the same mark the
   * staff engraves, so the grid and the page say one thing rather than two.
   * A plain hit and an empty cell carry no mark: the cell's own fill is the
   * whole of what they have to say.
   */
  readonly mark?: string;
}

/**
 * What the menu offers a cell, in the order it offers them. A table rather than
 * a list built into the menu, so the menu counts nothing and names nothing.
 * Now the whole of `ARTICULATIONS`: every value is writable, audible and
 * readable, on every instrument, and nothing is refused anywhere.
 */
export const ARTICULATION_CHOICES: readonly ArticulationChoice[] = [
  { id: 'empty', name: 'Empty' },
  { id: PLAIN, name: 'Plain' },
  { id: 'accent', name: 'Accent', mark: '\uE4A0' }, // SMuFL articAccentAbove
  // SMuFL noteheadParenthesis: the pair the staff draws around a ghosted head,
  // as one glyph with the head's own space left empty — which on a cell is the
  // cell.
  { id: 'ghost', name: 'Ghost', mark: '\uE0CE' },
  // SMuFL graceNoteAppoggiaturaStemUp: the unslashed grace note the staff draws
  // before the stroke, which is the whole of what a flam looks like.
  { id: 'flam', name: 'Flam', mark: '\uE562' },
  /* SMuFL textBlackNoteFrac8thShortStem then textBlackNoteShortStem: the pair
     of beamed notes the staff draws before a dragged stroke, which is a drag's
     whole written form and the one thing that tells it from a flam at a glance.
     Two characters rather than one because SMuFL beams a group by composition —
     the first note carries the beam, the second closes it. */
  { id: 'drag', name: 'Drag', mark: '\uE1F2\uE1F0' },
];

/** What one articulation is called and drawn with. */
export function choiceOf(articulation: Articulation): ArticulationChoice | undefined {
  return ARTICULATION_CHOICES.find(({ id }) => id === articulation);
}

/**
 * How hard a hit is struck. Four recordings of the same drum rather than four
 * gains of one (ADR 0006), so this names a rung and never a level — a number
 * here would invite arithmetic that the ear would not thank us for.
 *
 * Softest to hardest.
 */
export const DYNAMICS = ['softest', 'plain', 'hard', 'hardest'] as const;

export type Dynamic = (typeof DYNAMICS)[number];

/** One sound an articulation is played out as. */
export interface Hit {
  /**
   * Grace leads ahead of the step. `0` is the main hit, landing exactly on it;
   * a positive count is an ornament sounding that many leads early. What a lead
   * is worth in seconds is the schedule's business, not the vocabulary's.
   */
  readonly leads: number;
  readonly dynamic: Dynamic;
}

/**
 * The expansion table: what each articulation is actually played out as. The
 * one place that decides an accent is `hardest` and a ghost is `softest`, and
 * it decides in rungs — no filename appears here or anywhere else in the core.
 *
 * An ornament is a row of several hits: the leads say how far ahead of the step
 * each one sounds, and the count of them is the whole difference between a flam
 * and a drag.
 */
const HITS: Readonly<Record<Articulation, readonly Hit[]>> = {
  empty: [],
  normal: [{ leads: 0, dynamic: 'plain' }],
  accent: [{ leads: 0, dynamic: 'hardest' }],
  ghost: [{ leads: 0, dynamic: 'softest' }],
  flam: [
    { leads: 1, dynamic: 'softest' },
    { leads: 0, dynamic: 'hard' },
  ],
  drag: [
    { leads: 2, dynamic: 'softest' },
    { leads: 1, dynamic: 'softest' },
    { leads: 0, dynamic: 'hard' },
  ],
};

/** Every sound an articulation makes, earliest first. */
export function hitsOf(articulation: Articulation): readonly Hit[] {
  return HITS[articulation];
}

/**
 * The most grace leads any articulation asks for — a drag's first grace hit.
 * Read off the table rather than written down, so a new ornament moves it and
 * the schedule's horizon with it.
 */
export const MAX_LEADS = Math.max(
  ...Object.values(HITS).flatMap((hits) => hits.map(({ leads }) => leads)),
);

/** One flat lane per instrument, covering every step of the pattern. */
export type Lanes = Readonly<Record<InstrumentId, readonly Articulation[]>>;

export interface Pattern {
  readonly tempo: number;
  readonly lanes: Lanes;
}

/** Bar-relative steps, repeated across the bars. */
type Groove = Readonly<Partial<Record<InstrumentId, readonly number[]>>>;

function patternFrom(groove: Groove): Pattern {
  const lanes = {} as Record<InstrumentId, readonly Articulation[]>;
  for (const { id } of INSTRUMENTS) {
    const lane = new Array<Articulation>(TOTAL_STEPS).fill('empty');
    for (let bar = 0; bar < BARS; bar += 1) {
      for (const step of groove[id] ?? []) {
        lane[bar * STEPS_PER_BAR + step] = PLAIN;
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

/** What a cell holds. A step off the end of the pattern holds silence. */
export function articulationAt(
  pattern: Pattern,
  instrument: InstrumentId,
  step: number,
): Articulation {
  return pattern.lanes[instrument][step] ?? 'empty';
}

/** Whether a cell is written — the one question everything outside this module
 *  asks of a cell it does not care to read. */
export function isWritten(pattern: Pattern, instrument: InstrumentId, step: number): boolean {
  return articulationAt(pattern, instrument, step) !== 'empty';
}

/** An instrument struck at a dynamic — what the audio adapter is handed. */
export interface Sound {
  readonly instrument: InstrumentId;
  readonly dynamic: Dynamic;
}

/** A hit with the instrument striking it: one sound of one step. */
export interface StepHit extends Hit {
  readonly instrument: InstrumentId;
}

/**
 * Everything one step is played out as, in row order and each instrument's hits
 * earliest first — every hit already carrying the rung it is struck at, so
 * nothing downstream reads an articulation.
 *
 * An ornament's grace hits belong to the step they lead into, however far ahead
 * of it they sound: what a lead is worth in seconds is the schedule's business.
 */
export function hitsAt(pattern: Pattern, step: number): readonly StepHit[] {
  return INSTRUMENTS.flatMap(({ id }) =>
    hitsOf(articulationAt(pattern, id, step)).map((hit) => ({ instrument: id, ...hit })),
  );
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

/** Whether anything at all is written — one cell of any articulation is enough. */
export function anythingWritten(pattern: Pattern): boolean {
  return INSTRUMENTS.some(({ id }) =>
    pattern.lanes[id].some((articulation) => articulation !== 'empty'),
  );
}

/** Rubs out the whole groove, keeping the tempo it was played at. */
export function withNothingWritten(pattern: Pattern): Pattern {
  return { ...pattern, lanes: emptyPattern().lanes };
}

/** Sets one cell's articulation into a new `Pattern`; input untouched. */
export function withArticulation(
  pattern: Pattern,
  instrument: InstrumentId,
  step: number,
  articulation: Articulation,
): Pattern {
  const lane = pattern.lanes[instrument];
  return {
    ...pattern,
    lanes: { ...pattern.lanes, [instrument]: lane.with(step, articulation) },
  };
}

/**
 * What a tap does: an empty cell takes a plain hit, and a written cell is rubbed
 * out whatever it held. Anything finer than that comes through the menu, which
 * writes an articulation outright.
 */
export function toggleStep(pattern: Pattern, instrument: InstrumentId, step: number): Pattern {
  const next = isWritten(pattern, instrument, step) ? 'empty' : PLAIN;
  return withArticulation(pattern, instrument, step, next);
}
