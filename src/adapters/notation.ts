/**
 * The notation adapter: the only module that knows VexFlow exists.
 *
 * It makes no musical decisions. Everything it draws — note values, chords,
 * stems, staff positions, which notes share a beam — is already settled in the
 * `Score` it is handed. Its job is placement on a page: how wide a measure is,
 * how many fit on a system, where the clef goes.
 *
 * One drawing routine takes a rendering context, so the screen and the PNG
 * export can differ in nothing but the context they pass in.
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
 * The music font, self-hosted from the installed package and imported as a
 * build asset so the bundler content-hashes it — nothing is fetched from a CDN
 * at runtime. VexFlow's font-free entry point is what makes this possible: the
 * default entry point inlines a base64 copy of the same font.
 */
const MUSIC_FONT = 'Bravura';

let fontLoad: Promise<void> | undefined;

/**
 * Resolves once the staff can be drawn legibly. Memoised, so however many
 * components ask, the font is fetched once. Callers must await this before
 * drawing: glyphs measured against a missing font lay out wrongly, and the
 * wrong layout is what the reader would see.
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
  /** Measures per system. The caller decides; the export always passes all of them. */
  readonly measuresPerSystem: number;
}

/** Percussion clef on every system; the time signature only opens the piece. */
const CLEF = 'percussion';
const TIME_SIGNATURE = `${BEATS_PER_BAR}/4`;

/**
 * Page furniture, in points. The staff itself is five lines; the padding above
 * and below is room for the hi-hat sitting over the top line and for stems in
 * both directions.
 */
const MARGIN_X = 10;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 30;
const SYSTEM_HEIGHT = 100;
/** Room a leading clef and a time signature take out of a measure's width. */
const CLEF_WIDTH = 45;
const TIME_SIGNATURE_WIDTH = 30;
/**
 * Slack left at the end of a measure. The formatter positions note *centres*
 * across the width it is given, so without this the last notehead of a measure
 * straddles the barline.
 */
const NOTE_PADDING = 12;

/** VexFlow's duration codes, keyed by the IR's vocabulary. */
const DURATION_CODES: Readonly<Record<Duration, string>> = {
  whole: 'w',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
};

/** VexFlow spells a notehead shape as a suffix on the key. */
const NOTEHEAD_SUFFIX = { normal: '', cross: '/x2' } as const;

const STEM_DIRECTIONS = { up: 1, down: -1 } as const;

/** How tall the drawing will be, before anything is drawn. */
export function staffSize(score: Score, layout: StaffLayout): { width: number; height: number } {
  const systems = Math.ceil(score.measures.length / layout.measuresPerSystem);
  return { width: layout.width, height: MARGIN_TOP + systems * SYSTEM_HEIGHT + MARGIN_BOTTOM };
}

/**
 * The one drawing routine. Screen and export both land here; only the context
 * and the layout differ.
 */
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

/**
 * Where every measure lands on the page — the single answer both the drawing
 * and anything overlaid on it work from, so the two cannot disagree about which
 * patch of page belongs to which bar.
 */
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
 * The patch of page each measure occupies: its stave's width, and vertically
 * the whole band its system owns — the room VexFlow reserves above the lines
 * for high noteheads and up-stems, the lines themselves, and the room below
 * them for down-stems. Consecutive systems' bands tile rather than overlap, so
 * shading one measure never tints the bar underneath it.
 *
 * Returned rather than drawn, because shading a measure is something the screen
 * does and the export must not; keeping it out of `drawScore` is what lets the
 * two stay the same drawing.
 */
export function measureBoxes(score: Score, layout: StaffLayout): MeasureBox[] {
  return placeMeasures(score.measures.length, layout).map(({ x, y, width }) => ({
    x,
    y,
    width,
    height: SYSTEM_HEIGHT,
  }));
}

/**
 * Splits a system's width between its measures. Every measure gets the same
 * room for its notes; the clef and the time signature are paid for on top, so
 * an opening measure is not squeezed by the furniture in front of it.
 */
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

  // Both voices are formatted together so their notes line up vertically, then
  // drawn separately so each keeps its own stem direction.
  const drawn = measure.voices.map(toVexVoice);
  const voices = drawn.map(({ voice }) => voice);
  const room = stave.getNoteEndX() - stave.getNoteStartX() - NOTE_PADDING;
  new Formatter().joinVoices(voices).format(voices, Math.max(1, room));

  // Beams last: they are drawn from the notes' final positions, which only
  // exist once the voice has been formatted against this stave.
  for (const { voice, beams } of drawn) {
    voice.draw(context, stave);
    for (const beam of beams) beam.setContext(context).draw();
  }
}

/** A voice ready to draw: its notes as one tickable run, plus their beams. */
interface DrawnVoice {
  readonly voice: Voice;
  readonly beams: readonly Beam[];
}

function toVexVoice(voice: ScoreVoice): DrawnVoice {
  const notes = voice.entries.map((entry) => toStaveNote(entry, voice));

  return {
    // STRICT: the core guarantees each voice fills its measure exactly, so a
    // mismatch is a bug worth failing loudly rather than drawing crookedly.
    voice: new Voice({ numBeats: BEATS_PER_BAR, beatValue: 4 })
      .setMode(Voice.Mode.STRICT)
      .addTickables(notes),
    /*
     * Which notes belong together is already settled in the IR — the adapter
     * has no say in it and no rule of its own to apply. Constructing the beam
     * here, before formatting, is also what takes the flags off its notes.
     */
    beams: voice.beamGroups.map((group) => new Beam(group.map((index) => notes[index]!))),
  };
}

function toStaveNote(entry: Entry, voice: ScoreVoice): StaveNote {
  const rest = entry.kind === 'rest';
  const note = new StaveNote({
    keys: rest ? [entry.position] : entry.noteheads.map(keyOf),
    // Dots have to be spelled in the duration — that is what VexFlow counts the
    // note's ticks from — *and* attached as modifiers below, which is what
    // draws them. Spelling alone draws nothing; attaching alone leaves the note
    // a third too short and the measure rejected as incomplete.
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

/**
 * Draws the score into an element as SVG, replacing whatever was there. This
 * is the screen path; the export path will build its own context around the
 * same `drawScore`.
 */
export function renderScoreSvg(host: HTMLDivElement, score: Score, layout: StaffLayout): void {
  host.replaceChildren();

  const { width, height } = staffSize(score, layout);
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width, height);
  drawScore(renderer.getContext(), score, layout);

  /*
   * VexFlow writes the logical size out as an inline style as well as an
   * attribute, and an inline style beats any stylesheet — which pins the
   * drawing at a width the container may not have, and leaves a phone showing
   * the left two thirds of a bar. The viewBox is what carries the geometry, so
   * the inline sizing is dropped and how the drawing is fitted to the page is
   * left to CSS, where it belongs.
   */
  const svg = host.firstElementChild as SVGSVGElement | null;
  svg?.style.removeProperty('width');
  svg?.style.removeProperty('height');
}

/** The narrowest a sixteenth stays legible at, in points. */
const MIN_STEP_WIDTH = 20;

/** The width a system of this many measures needs before it starts to crowd. */
function minimumSystemWidth(measures: number): number {
  const notes = measures * STEPS_PER_BEAT * BEATS_PER_BAR * MIN_STEP_WIDTH;
  return notes + CLEF_WIDTH + TIME_SIGNATURE_WIDTH + 2 * MARGIN_X;
}

/**
 * Chooses how to lay the score out inside a container of this width.
 *
 * The staff picks its wrapping point from its own content's minimum legible
 * width, not from a breakpoint shared with the grid — the two views are free to
 * switch at different widths.
 *
 * Below the point where even a single measure fits, the drawing is still made
 * at its minimum width and left to scale down to the container, because a
 * proportionally smaller staff reads better than a crowded or clipped one.
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
