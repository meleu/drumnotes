/**
 * Where the notation lands on the page: systems, measure widths, and the patch
 * each measure occupies. Pure — no VexFlow, no DOM. The drawing and anything
 * overlaid on it read the same placements, so they cannot disagree about where
 * a measure is.
 */

import { EXPORT_WIDTH } from './export.js';
import { STEPS_PER_BAR } from './pattern.js';
import type { Measure, Score } from './score.js';

export interface StaffLayout {
  /** Logical width of the drawing, in points. */
  readonly width: number;
  /** Caller's choice; the export always passes all of them. */
  readonly measuresPerSystem: number;
}

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

/** The drawing's size, before anything is drawn. */
export function staffSize(score: Score, layout: StaffLayout): { width: number; height: number } {
  const systems = Math.ceil(score.measures.length / layout.measuresPerSystem);
  return { width: layout.width, height: MARGIN_TOP + systems * SYSTEM_HEIGHT + MARGIN_BOTTOM };
}

export interface Placement extends MeasureFurniture {
  /** Where this measure's stave is drawn. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Vertically, the whole band its system owns. Bands tile rather than
   *  overlap, so shading one measure never tints the bar underneath. */
  readonly height: number;
}

/**
 * Where every measure lands — the single answer both the drawing and anything
 * overlaid on it work from, so they cannot disagree.
 *
 * Returned rather than drawn: shading is a screen-only thing, and keeping it out
 * of `drawScore` is what lets screen and export stay one drawing.
 */
export function placeMeasures(score: Score, layout: StaffLayout): Placement[] {
  const count = score.measures.length;
  const perSystem = Math.max(1, Math.trunc(layout.measuresPerSystem));
  const placed: Placement[] = [];

  for (let start = 0; start < count; start += perSystem) {
    const system = start / perSystem;
    const y = MARGIN_TOP + system * SYSTEM_HEIGHT;
    let x = MARGIN_X;

    const widths = measureWidths(
      score.measures.slice(start, start + perSystem),
      system === 0,
      layout,
    );
    for (const [position, width] of widths.entries()) {
      placed.push({
        x,
        y,
        width,
        height: SYSTEM_HEIGHT,
        clef: position === 0,
        timeSignature: system === 0 && position === 0,
      });
      x += width;
    }
  }
  return placed;
}

/**
 * Splits a system's width between its measures, in proportion to what each of
 * them needs, with the clef and time signature paid for on top. Proportion
 * rather than equal shares because measures are not equally busy: a bar of
 * drags beside a bar of quarter notes has to take the room from it, or the
 * ornaments are drawn past the barline.
 */
function measureWidths(
  measures: readonly Measure[],
  isFirstSystem: boolean,
  layout: StaffLayout,
): number[] {
  const extras = measures.map((_, index) => {
    if (index !== 0) return 0;
    return CLEF_WIDTH + (isFirstSystem ? TIME_SIGNATURE_WIDTH : 0);
  });
  const available = layout.width - 2 * MARGIN_X - extras.reduce((sum, extra) => sum + extra, 0);

  const needs = measures.map(minimumMeasureWidth);
  const needed = needs.reduce((sum, need) => sum + need, 0);

  return extras.map((extra, index) => (available * needs[index]!) / needed + extra);
}

export interface MeasureFurniture {
  readonly clef: boolean;
  readonly timeSignature: boolean;
}

/** The narrowest a sixteenth stays legible at, in points. */
const MIN_STEP_WIDTH = 20;

/**
 * What the grace notes leading one stroke add to the step they lead into. They
 * are drawn small and ahead of it, but they are still ink between two strokes:
 * a group costs room of its own, and each slot after the first a little more.
 *
 * Legibility minimums like `MIN_STEP_WIDTH`, not a measurement of any drawing —
 * this module knows nothing about how the notation is rendered.
 */
const MIN_GRACE_GROUP_WIDTH = 24;
const MIN_GRACE_SLOT_WIDTH = 8;

/**
 * Width a measure needs before it crowds: room for a sixteenth on every step,
 * and for whatever ornaments lead into them.
 *
 * Grace notes on the same step of both voices are drawn one above the other, so
 * a step costs the busier voice's ornament rather than the sum of the two.
 */
function minimumMeasureWidth(measure: Measure): number {
  const slotsByStep = new Map<number, number>();
  for (const voice of measure.voices) {
    for (const entry of voice.entries) {
      if (entry.kind !== 'note' || entry.graces.length === 0) continue;
      const busiest = Math.max(slotsByStep.get(entry.startStep) ?? 0, entry.graces.length);
      slotsByStep.set(entry.startStep, busiest);
    }
  }

  const ornaments = [...slotsByStep.values()].reduce(
    (sum, slots) => sum + MIN_GRACE_GROUP_WIDTH + (slots - 1) * MIN_GRACE_SLOT_WIDTH,
    0,
  );
  return STEPS_PER_BAR * MIN_STEP_WIDTH + ornaments;
}

/** Width a system of these measures needs before it crowds. */
function minimumSystemWidth(measures: readonly Measure[]): number {
  const notes = measures.reduce((sum, measure) => sum + minimumMeasureWidth(measure), 0);
  return notes + CLEF_WIDTH + TIME_SIGNATURE_WIDTH + 2 * MARGIN_X;
}

/** The widest any one system of this score would have to be, laid out this many
 *  measures to a system. */
function minimumWidthFor(score: Score, measuresPerSystem: number): number {
  let widest = 0;
  for (let start = 0; start < score.measures.length; start += measuresPerSystem) {
    widest = Math.max(
      widest,
      minimumSystemWidth(score.measures.slice(start, start + measuresPerSystem)),
    );
  }
  return widest;
}

/**
 * How to lay the score out in a container of this width. The wrapping point
 * comes from the staff's own minimum legible width — which is the score's, not
 * a measure count's: a bar of drags needs room a bar of quarter notes does not.
 * Narrower than one measure, it is still drawn at that minimum and left to
 * scale down: a smaller staff reads better than a clipped one.
 */
export function staffLayoutFor(containerWidth: number, score: Score): StaffLayout {
  let measuresPerSystem = score.measures.length;
  while (measuresPerSystem > 1 && minimumWidthFor(score, measuresPerSystem) > containerWidth) {
    measuresPerSystem -= 1;
  }
  return {
    width: Math.max(containerWidth, minimumWidthFor(score, measuresPerSystem)),
    measuresPerSystem,
  };
}

/** One system, and one width whatever the viewport says — widened only where
 *  the music itself will not fit in it, since a cut-off ornament is not a
 *  picture of the groove. */
export function exportStaffLayout(score: Score): StaffLayout {
  const measuresPerSystem = score.measures.length;
  return {
    width: Math.max(EXPORT_WIDTH, minimumWidthFor(score, measuresPerSystem)),
    measuresPerSystem,
  };
}
