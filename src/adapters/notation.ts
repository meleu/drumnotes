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
  Articulation,
  Beam,
  Dot,
  Font,
  GraceNote,
  GraceNoteGroup,
  Modifier,
  Formatter,
  Parenthesis,
  Renderer,
  Stave,
  StaveNote,
  VexFlow,
  Voice,
} from 'vexflow/core';

import type { MeasureFurniture, Placement, StaffLayout } from '../core/layout.js';
import { placeMeasures, staffSize } from '../core/layout.js';
import type { Duration, Entry, GraceSlot, Score, ScoreVoice } from '../core/score.js';
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

/** SMuFL accent, as VexFlow spells it. */
const ACCENT = 'a>';

/** What a grace note is drawn as. A drawing constant, not a note value: a grace
 *  note occupies no time, so what it is worth is never asked. */
const GRACE_DURATION = '8';

/* Marks go on the far side of the stem from the staff, so a voice's accents sit
   clear of the notes and of the other voice's: hands above, feet below. Read off
   the stem the voice already has, which is what keeps grid, staff and page
   agreeing without a second table to disagree with. */
const MARK_POSITIONS = {
  up: Modifier.Position.ABOVE,
  down: Modifier.Position.BELOW,
} as const;

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
  // One mark for the stroke, however many heads share the stem.
  if (!rest && entry.accented) {
    note.addModifier(new Articulation(ACCENT).setPosition(MARK_POSITIONS[voice.stem]));
  }
  if (!rest) {
    // Bound to a head by index rather than to the note, which is what keeps a
    // ghosted snare's brackets off the hi-hat it is struck with. VexFlow's own
    // `buildAndAttach` parenthesises every head, so the pair is built here.
    for (const [index, notehead] of entry.noteheads.entries()) {
      if (!notehead.parenthesised) continue;
      for (const side of [Modifier.Position.LEFT, Modifier.Position.RIGHT]) {
        note.addModifier(new Parenthesis(side), index);
      }
    }
  }
  if (!rest && entry.graces.length > 0) note.addModifier(graceGroup(entry.graces, voice));
  return note;
}

/**
 * The grace notes a stroke is led into by, as one group.
 *
 * A slot at a time, so heads sounding the same distance ahead share a stem, and
 * the group as a whole hangs off the note it leads into — which is what leaves
 * the measure adding up without them. Drumset convention throughout: unslashed,
 * slurred into the stroke they lead, and beamed as soon as there is more than one.
 */
function graceGroup(slots: readonly GraceSlot[], voice: ScoreVoice): GraceNoteGroup {
  const graces = slots.map(
    (slot) =>
      new GraceNote({
        keys: slot.map(keyOf),
        duration: GRACE_DURATION,
        slash: false,
        stemDirection: STEM_DIRECTIONS[voice.stem],
      }),
  );
  return new GraceNoteGroup(graces, true).beamNotes();
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
