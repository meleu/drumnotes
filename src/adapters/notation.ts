/**
 * The only module that knows VexFlow exists. Makes no musical decisions: note
 * values, chords, stems, positions and beams are all settled in the `Score`.
 * Its job is placement on a page — measure widths, systems, clefs.
 *
 * One drawing routine, parameterised by rendering context, so screen and PNG
 * export differ in nothing else.
 */

import bravuraUrl from '@vexflow-fonts/bravura/bravura.woff2?url';
import type { RenderContext } from 'vexflow/core';
import {
  Beam,
  Dot,
  Font,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  VexFlow,
  Voice,
} from 'vexflow/core';

import type { Duration, Entry, Score, ScoreVoice } from '../core/score.js';
import { BEATS_PER_BAR, STEPS_PER_BEAT } from '../core/pattern.js';

/**
 * Self-hosted as a build asset — nothing fetched from a CDN at runtime. Made
 * possible by VexFlow's font-free entry point; the default one inlines a base64
 * copy of the same font.
 */
const MUSIC_FONT = 'Bravura';

let fontLoad: Promise<void> | undefined;

/**
 * Resolves once the staff can be drawn legibly. Memoised: fetched once however
 * many components ask. Callers must await before drawing — glyphs measured
 * against a missing font lay out wrongly.
 */
export function loadNotationFont(): Promise<void> {
  fontLoad ??= Font.load(MUSIC_FONT, bravuraUrl, { display: 'block' }).then(() => {
    VexFlow.setFonts(MUSIC_FONT);
  });
  return fontLoad;
}

export interface StaffLayout {
  /** Logical width of the drawing, in points. */
  readonly width: number;
  /** Caller's choice; the export always passes all of them. */
  readonly measuresPerSystem: number;
}

/** Clef on every system; the time signature only opens the piece. */
const CLEF = 'percussion';
const TIME_SIGNATURE = `${BEATS_PER_BAR}/4`;

/** Page furniture, in points. Vertical padding is room for the hi-hat above the
 *  top line and for stems both ways. */
const MARGIN_X = 10;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 30;
/** The band one system owns, beams to down-stems. Wider than the ink needs: a
 *  low foot note's stem reaches into the next system's hi-hat beams. */
const SYSTEM_HEIGHT = 130;
/** Room a leading clef and time signature take out of a measure's width. */
const CLEF_WIDTH = 45;
const TIME_SIGNATURE_WIDTH = 30;
/** The formatter positions note *centres*, so without slack the last notehead
 *  straddles the barline. */
const NOTE_PADDING = 12;

/** VexFlow duration codes, keyed by the IR's vocabulary. */
const DURATION_CODES: Readonly<Record<Duration, string>> = {
  whole: 'w',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
};

/** VexFlow spells a notehead shape as a suffix on the key. */
const NOTEHEAD_SUFFIX = { normal: '', cross: '/x2' } as const;

const STEM_DIRECTIONS = { up: 1, down: -1 } as const;

/** The drawing's size, before anything is drawn. */
export function staffSize(score: Score, layout: StaffLayout): { width: number; height: number } {
  const systems = Math.ceil(score.measures.length / layout.measuresPerSystem);
  return { width: layout.width, height: MARGIN_TOP + systems * SYSTEM_HEIGHT + MARGIN_BOTTOM };
}

/** The one drawing routine; screen and export differ only in context and layout. */
export function drawScore(context: RenderContext, score: Score, layout: StaffLayout): void {
  const placed = placeMeasures(score.measures.length, layout);

  for (const [index, measure] of score.measures.entries()) {
    const { x, y, width, clef, timeSignature } = placed[index]!;
    drawMeasure(context, measure, x, y, width, { clef, timeSignature });
  }
}

interface Placement extends MeasureFurniture {
  /** Where this measure's stave is drawn. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/** Where every measure lands — the single answer both the drawing and anything
 *  overlaid on it work from, so they cannot disagree. */
function placeMeasures(count: number, layout: StaffLayout): Placement[] {
  const perSystem = Math.max(1, Math.trunc(layout.measuresPerSystem));
  const placed: Placement[] = [];

  for (let start = 0; start < count; start += perSystem) {
    const system = start / perSystem;
    const y = MARGIN_TOP + system * SYSTEM_HEIGHT;
    let x = MARGIN_X;

    const widths = measureWidths(Math.min(perSystem, count - start), system === 0, layout);
    for (const [position, width] of widths.entries()) {
      placed.push({
        x,
        y,
        width,
        clef: position === 0,
        timeSignature: system === 0 && position === 0,
      });
      x += width;
    }
  }
  return placed;
}

/** A rectangle of the drawing, in the drawing's own coordinates. */
export interface MeasureBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The patch of page each measure occupies: stave width, and vertically the whole
 * band its system owns. Bands tile rather than overlap, so shading one measure
 * never tints the bar underneath.
 *
 * Returned rather than drawn: shading is a screen-only thing, and keeping it out
 * of `drawScore` is what lets screen and export stay one drawing.
 */
export function measureBoxes(score: Score, layout: StaffLayout): MeasureBox[] {
  return placeMeasures(score.measures.length, layout).map(({ x, y, width }) => ({
    x,
    y,
    width,
    height: SYSTEM_HEIGHT,
  }));
}

/** Splits a system's width between its measures: equal room for notes, with the
 *  clef and time signature paid for on top. */
function measureWidths(count: number, isFirstSystem: boolean, layout: StaffLayout): number[] {
  const extras = Array.from({ length: count }, (_, index) => {
    if (index !== 0) return 0;
    return CLEF_WIDTH + (isFirstSystem ? TIME_SIGNATURE_WIDTH : 0);
  });
  const available = layout.width - 2 * MARGIN_X - extras.reduce((sum, extra) => sum + extra, 0);

  return extras.map((extra) => available / count + extra);
}

interface MeasureFurniture {
  readonly clef: boolean;
  readonly timeSignature: boolean;
}

function drawMeasure(
  context: RenderContext,
  measure: { readonly voices: readonly ScoreVoice[] },
  x: number,
  y: number,
  width: number,
  furniture: MeasureFurniture,
): void {
  const stave = new Stave(x, y, width);
  if (furniture.clef) stave.addClef(CLEF);
  if (furniture.timeSignature) stave.addTimeSignature(TIME_SIGNATURE);
  stave.setContext(context).draw();

  // Formatted together so the notes line up vertically, drawn separately so
  // each voice keeps its stem direction.
  const drawn = measure.voices.map(toVexVoice);
  const voices = drawn.map(({ voice }) => voice);
  const room = stave.getNoteEndX() - stave.getNoteStartX() - NOTE_PADDING;
  new Formatter().joinVoices(voices).format(voices, Math.max(1, room));

  // Beams last: drawn from final note positions, which only exist once the
  // voice is formatted against this stave.
  for (const { voice, beams } of drawn) {
    voice.draw(context, stave);
    for (const beam of beams) beam.setContext(context).draw();
  }
}

/** A voice ready to draw: one tickable run, plus its beams. */
interface DrawnVoice {
  readonly voice: Voice;
  readonly beams: readonly Beam[];
}

function toVexVoice(voice: ScoreVoice): DrawnVoice {
  const notes = voice.entries.map((entry) => toStaveNote(entry, voice));

  return {
    // STRICT: the core guarantees each voice fills its measure exactly, so a
    // mismatch is a bug worth failing loudly.
    voice: new Voice({ numBeats: BEATS_PER_BAR, beatValue: 4 })
      .setMode(Voice.Mode.STRICT)
      .addTickables(notes),
    // Grouping comes from the IR. Constructing the beam here, before
    // formatting, is also what takes the flags off its notes.
    beams: voice.beamGroups.map((group) => new Beam(group.map((index) => notes[index]!))),
  };
}

function toStaveNote(entry: Entry, voice: ScoreVoice): StaveNote {
  const rest = entry.kind === 'rest';
  const note = new StaveNote({
    keys: rest ? [entry.position] : entry.noteheads.map(keyOf),
    // Dots go in the duration (VexFlow counts ticks from it) *and* as modifiers
    // below (which draws them). Spelling alone draws nothing; attaching alone
    // leaves the note short and the measure rejected as incomplete.
    duration: DURATION_CODES[entry.duration] + 'd'.repeat(entry.dots) + (rest ? 'r' : ''),
    stemDirection: STEM_DIRECTIONS[voice.stem],
  });
  if (entry.dots > 0) {
    for (let dot = 0; dot < entry.dots; dot += 1) Dot.buildAndAttach([note], { all: true });
  }
  return note;
}

function keyOf(notehead: { position: string; type: keyof typeof NOTEHEAD_SUFFIX }): string {
  return notehead.position + NOTEHEAD_SUFFIX[notehead.type];
}

/** Draws the score into an element as SVG, replacing what was there. The screen
 *  path; the export builds its own context around the same `drawScore`. */
export function renderScoreSvg(host: HTMLDivElement, score: Score, layout: StaffLayout): void {
  host.replaceChildren();

  const { width, height } = staffSize(score, layout);
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width, height);
  drawScore(renderer.getContext(), score, layout);

  /*
   * VexFlow also writes the logical size as an inline style, which beats any
   * stylesheet and pins the drawing at a width the container may not have. The
   * viewBox carries the geometry, so drop the inline sizing and leave fitting
   * to CSS.
   */
  const svg = host.firstElementChild as SVGSVGElement | null;
  svg?.style.removeProperty('width');
  svg?.style.removeProperty('height');
}

/** The narrowest a sixteenth stays legible at, in points. */
const MIN_STEP_WIDTH = 20;

/** Width a system of this many measures needs before it crowds. */
function minimumSystemWidth(measures: number): number {
  const notes = measures * STEPS_PER_BEAT * BEATS_PER_BAR * MIN_STEP_WIDTH;
  return notes + CLEF_WIDTH + TIME_SIGNATURE_WIDTH + 2 * MARGIN_X;
}

/**
 * How to lay the score out in a container of this width. The wrapping point
 * comes from the staff's own minimum legible width, not a breakpoint shared
 * with the grid. Narrower than one measure, it is still drawn at that minimum
 * and left to scale down: a smaller staff reads better than a clipped one.
 */
export function staffLayoutFor(containerWidth: number, measures: number): StaffLayout {
  let measuresPerSystem = measures;
  while (measuresPerSystem > 1 && minimumSystemWidth(measuresPerSystem) > containerWidth) {
    measuresPerSystem -= 1;
  }
  return {
    width: Math.max(containerWidth, minimumSystemWidth(measuresPerSystem)),
    measuresPerSystem,
  };
}
