/**
 * The only module that knows VexFlow exists. Makes no decision of its own: note
 * values, chords, stems, positions and beams are settled in the `Score`, and
 * where each measure lands in `core/layout`. It is handed rectangles and fills
 * them with notation.
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

import type { MeasureFurniture, Placement, StaffLayout } from '../core/layout.js';
import { placeMeasures, staffSize } from '../core/layout.js';
import type { Duration, Entry, Score, ScoreVoice } from '../core/score.js';
import { BEATS_PER_BAR } from '../core/pattern.js';

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

/** Clef on every system; the time signature only opens the piece. */
const CLEF = 'percussion';
const TIME_SIGNATURE = `${BEATS_PER_BAR}/4`;

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

/** The one drawing routine; screen and export differ only in context and placements. */
export function drawScore(
  context: RenderContext,
  score: Score,
  placements: readonly Placement[],
): void {
  for (const [index, measure] of score.measures.entries()) {
    const { x, y, width, clef, timeSignature } = placements[index]!;
    drawMeasure(context, measure, x, y, width, { clef, timeSignature });
  }
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
  drawScore(renderer.getContext(), score, placeMeasures(score, layout));

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
