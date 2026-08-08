/**
 * The notation adapter: the only module that knows VexFlow exists.
 *
 * It makes no musical decisions. Everything it draws — note values, chords,
 * stems, staff positions, and later beam groups — is already settled in the
 * `Score` it is handed. Its job is placement on a page: how wide a measure is,
 * how many fit on a system, where the clef goes.
 *
 * One drawing routine takes a rendering context, so the screen and the PNG
 * export can differ in nothing but the context they pass in.
 */

import bravuraUrl from '@vexflow-fonts/bravura/bravura.woff2?url';
import type { RenderContext } from 'vexflow/core';
import { Dot, Font, Formatter, Renderer, Stave, StaveNote, VexFlow, Voice } from 'vexflow/core';

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
  const perSystem = Math.max(1, Math.trunc(layout.measuresPerSystem));

  for (let start = 0; start < score.measures.length; start += perSystem) {
    const system = score.measures.slice(start, start + perSystem);
    const y = MARGIN_TOP + (start / perSystem) * SYSTEM_HEIGHT;
    let x = MARGIN_X;

    for (const [position, width] of measureWidths(system.length, start === 0, layout).entries()) {
      drawMeasure(context, system[position]!, x, y, width, {
        clef: position === 0,
        timeSignature: start === 0 && position === 0,
      });
      x += width;
    }
  }
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
  const voices = measure.voices.map(toVexVoice);
  const room = stave.getNoteEndX() - stave.getNoteStartX() - NOTE_PADDING;
  new Formatter().joinVoices(voices).format(voices, Math.max(1, room));
  for (const voice of voices) voice.draw(context, stave);
}

function toVexVoice(voice: ScoreVoice): Voice {
  // STRICT: the core guarantees each voice fills its measure exactly, so a
  // mismatch is a bug worth failing loudly rather than drawing crookedly.
  return new Voice({ numBeats: BEATS_PER_BAR, beatValue: 4 })
    .setMode(Voice.Mode.STRICT)
    .addTickables(voice.entries.map((entry) => toStaveNote(entry, voice)));
}

function toStaveNote(entry: Entry, voice: ScoreVoice): StaveNote {
  const rest = entry.kind === 'rest';
  const note = new StaveNote({
    keys: rest ? [entry.position] : entry.noteheads.map(keyOf),
    duration: DURATION_CODES[entry.duration] + (rest ? 'r' : ''),
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
