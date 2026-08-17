/** Pattern document: pure immutable value. No Svelte/DOM/notation lib. */

export const BARS = 2;
export const STEPS_PER_BAR = 16;
export const STEPS_PER_BEAT = 4;

/** Derived — nothing hardcodes a step count. */
export const BEATS_PER_BAR = STEPS_PER_BAR / STEPS_PER_BEAT;
export const TOTAL_STEPS = BARS * STEPS_PER_BAR;

export const DEFAULT_TEMPO = 90;
/** Playable range, enforced here, not just in input attrs. */
export const MIN_TEMPO = 40;
export const MAX_TEMPO = 240;

export type InstrumentId = 'hihat' | 'snare' | 'kick';

/** Scientific pitch. Notation, not sound. */
export type StaffPosition = string;

/** PAS: cross for cymbals, plain otherwise. */
export type NoteheadType = 'normal' | 'cross';

/** Hands up, feet down. */
export type VoiceId = 'hands' | 'feet';

export interface Instrument {
  readonly id: InstrumentId;
  readonly name: string;
  /** Row label; name is what screen readers get. */
  readonly abbreviation: string;
  readonly voice: VoiceId;
  readonly position: StaffPosition;
  readonly notehead: NoteheadType;
}

/**
 * Top-to-bottom by staff height, so grid and notation read as one. PAS key
 * positions; top line free for a future ride. No sounds: instrument→sample
 * lives in the audio adapter, keeping this pure.
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
  /** Own height per voice: rests never collide, reader sees whose silence. */
  readonly restPosition: StaffPosition;
}

/** Order written into a measure. */
export const VOICES: readonly VoiceStyle[] = [
  { id: 'hands', stem: 'up', restPosition: 'd/5' },
  { id: 'feet', stem: 'down', restPosition: 'f/4' },
];

/**
 * How a cell is struck — one value, never two, so an accented flam is
 * unwritable (ADR 0005). `empty` is silence. Menu order, silence first.
 */
export const ARTICULATIONS = ['empty', 'normal', 'accent', 'ghost', 'flam', 'drag'] as const;

export type Articulation = (typeof ARTICULATIONS)[number];

/** What a tap writes; fills the landing groove. */
const PLAIN: Articulation = 'normal';

export interface ArticulationChoice {
  readonly id: Articulation;
  /** Menu label; also read out by screen readers. */
  readonly name: string;
  /**
   * Cell glyph: chart shorthand in plain chars, since real engraving shrunk to
   * a square is a scribble. Plain/empty have none — the fill says it all.
   */
  readonly mark?: string;
}

/**
 * Menu contents and order. A table, so the menu counts and names nothing.
 * Covers all of `ARTICULATIONS`: every value works on every instrument.
 */
export const ARTICULATION_CHOICES: readonly ArticulationChoice[] = [
  { id: 'empty', name: 'Empty' },
  { id: PLAIN, name: 'Plain' },
  { id: 'accent', name: 'Accent', mark: '>' },
  // Staff's ghost parens, held apart so the head's space reads as empty.
  { id: 'ghost', name: 'Ghost', mark: '( )' },
  // Ornaments as initials: chart convention, legible at phone-cell size.
  { id: 'flam', name: 'Flam', mark: 'f' },
  { id: 'drag', name: 'Drag', mark: 'd' },
];

/** How one articulation is named and drawn. */
export function choiceOf(articulation: Articulation): ArticulationChoice | undefined {
  return ARTICULATION_CHOICES.find(({ id }) => id === articulation);
}

/**
 * How hard a hit is struck, softest to hardest. Four recordings, not four gains
 * (ADR 0006) — rungs, not levels, so nobody does arithmetic on them.
 */
export const DYNAMICS = ['softest', 'plain', 'hard', 'hardest'] as const;

export type Dynamic = (typeof DYNAMICS)[number];

/** One sound of an articulation. */
export interface Hit {
  /** Leads ahead of the step: 0 = main hit. Seconds-per-lead is schedule's job. */
  readonly leads: number;
  readonly dynamic: Dynamic;
}

/**
 * Expansion table: what each articulation is played as. Sole decider that accent
 * is `hardest`, ghost `softest` — in rungs; no filenames in core. An ornament is
 * several hits; their lead count is the whole flam/drag difference.
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

/** Every sound of an articulation, earliest first. */
export function hitsOf(articulation: Articulation): readonly Hit[] {
  return HITS[articulation];
}

/**
 * Most leads any articulation asks for. Read off the table, so a new ornament
 * moves it and the schedule's horizon with it.
 */
export const MAX_LEADS = Math.max(
  ...Object.values(HITS).flatMap((hits) => hits.map(({ leads }) => leads)),
);

/** One flat lane per instrument, every step. */
export type Lanes = Readonly<Record<InstrumentId, readonly Articulation[]>>;

export interface Pattern {
  readonly tempo: number;
  readonly lanes: Lanes;
}

/** Bar-relative steps, repeated across bars. */
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

/** Bar-relative step of a 1-based beat, plus offset. */
function beatStep(beat: number, offset = 0): number {
  return (beat - 1) * STEPS_PER_BEAT + offset;
}

/** Straight eighth rock: the first-visit groove. */
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

/** Counting: `1 e + a`, once per beat. */
const COUNT_LABELS = ['e', '+', 'a'];

export interface GridStep {
  /** Absolute lane index. */
  readonly index: number;
  readonly label: string;
  readonly isBeatStart: boolean;
}

export interface GridBar {
  readonly index: number;
  readonly steps: readonly GridStep[];
}

/** Bar blocks of labelled steps. Boundaries derived: adding a bar is a data change. */
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

/** Playing step → its measure. */
export function barOfStep(step: number): number {
  return Math.floor(step / STEPS_PER_BAR);
}

/** What a cell holds; off-the-end is silence. */
export function articulationAt(
  pattern: Pattern,
  instrument: InstrumentId,
  step: number,
): Articulation {
  return pattern.lanes[instrument][step] ?? 'empty';
}

/** Whether a cell is written — all outsiders ask of a cell they won't read. */
export function isWritten(pattern: Pattern, instrument: InstrumentId, step: number): boolean {
  return articulationAt(pattern, instrument, step) !== 'empty';
}

/** Instrument struck at a dynamic — what the audio adapter gets. */
export interface Sound {
  readonly instrument: InstrumentId;
  readonly dynamic: Dynamic;
}

/** A hit plus its instrument: one sound of one step. */
export interface StepHit extends Hit {
  readonly instrument: InstrumentId;
}

/**
 * Everything one step plays: row order, each instrument's hits earliest first,
 * rung included so nothing downstream reads an articulation. Grace hits belong
 * to the step they lead into, however early they sound.
 */
export function hitsAt(pattern: Pattern, step: number): readonly StepHit[] {
  return INSTRUMENTS.flatMap(({ id }) =>
    hitsOf(articulationAt(pattern, id, step)).map((hit) => ({ instrument: id, ...hit })),
  );
}

/**
 * Nearest playable tempo; every route in comes through here. Total: a non-number
 * gives the default, never a NaN that poisons derived durations.
 */
export function clampTempo(tempo: number): number {
  if (!Number.isFinite(tempo)) return DEFAULT_TEMPO;
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(tempo)));
}

/** Same groove, clamped tempo. Lanes shared, not copied. */
export function withTempo(pattern: Pattern, tempo: number): Pattern {
  return { ...pattern, tempo: clampTempo(tempo) };
}

export function anythingWritten(pattern: Pattern): boolean {
  return INSTRUMENTS.some(({ id }) =>
    pattern.lanes[id].some((articulation) => articulation !== 'empty'),
  );
}

/** Rubs out the groove, keeps the tempo. */
export function withNothingWritten(pattern: Pattern): Pattern {
  return { ...pattern, lanes: emptyPattern().lanes };
}

/**
 * Whether two patterns are the same document — the same groove, struck the same
 * way, at the same tempo. Compared by value, never by identity: a pattern loaded
 * off the library is a different object from the one that was kept, and they are
 * still the same pattern.
 *
 * Both the tempo and how each cell is struck count. Retuning, or accenting a hit
 * that was plain, makes a different pattern of the same groove — which is why
 * either alone is enough to say the grid has diverged from what was kept.
 */
export function samePattern(one: Pattern, other: Pattern): boolean {
  if (one.tempo !== other.tempo) return false;
  return INSTRUMENTS.every(({ id }) => {
    const lane = one.lanes[id];
    const against = other.lanes[id];
    return (
      lane.length === against.length &&
      lane.every((articulation, step) => articulation === against[step])
    );
  });
}

/** One cell's articulation into a new `Pattern`; input untouched. */
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

/** A tap: empty cell → plain hit, written cell → rubbed out. Finer choices come
 *  from the menu, which writes an articulation outright. */
export function toggleStep(pattern: Pattern, instrument: InstrumentId, step: number): Pattern {
  const next = isWritten(pattern, instrument, step) ? 'empty' : PLAIN;
  return withArticulation(pattern, instrument, step, next);
}
