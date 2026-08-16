/**
 * Where notation lands: systems, measure widths, the patch each measure owns.
 * Pure — no VexFlow, no DOM. Drawing and overlays read the same placements, so
 * they cannot disagree about where a measure is.
 */

import { EXPORT_WIDTH } from './export.js';
import { STEPS_PER_BAR } from './pattern.js';
import type { Measure, Score } from './score.js';

export interface StaffLayout {
  /** Logical drawing width, in points. */
  readonly width: number;
  /** Caller's choice; export always passes all of them. */
  readonly measuresPerSystem: number;
}

/** Page furniture, in points. Vertical padding: hi-hat above the top line,
 *  stems both ways. */
const MARGIN_X = 10;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 30;
/** Band one system owns, beams to down-stems. Wider than the ink needs: a low
 *  foot stem reaches into the next system's hi-hat beams. */
const SYSTEM_HEIGHT = 130;
/** Room a leading clef/time signature takes from a measure's width. */
const CLEF_WIDTH = 45;
const TIME_SIGNATURE_WIDTH = 30;

/** Drawing size, before anything is drawn. */
export function staffSize(score: Score, layout: StaffLayout): { width: number; height: number } {
  const systems = Math.ceil(score.measures.length / layout.measuresPerSystem);
  return { width: layout.width, height: MARGIN_TOP + systems * SYSTEM_HEIGHT + MARGIN_BOTTOM };
}

export interface Placement extends MeasureFurniture {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Its system's whole band. Bands tile, not overlap, so shading one measure
   *  never tints the bar underneath. */
  readonly height: number;
}

/**
 * Where every measure lands — one answer drawing and overlays both work from.
 * Returned, not drawn: shading is screen-only, and keeping it out of `drawScore`
 * is what lets screen and export stay one drawing.
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
 * Splits a system's width between measures in proportion to need, clef and time
 * signature paid on top. Proportional, not equal: a bar of drags must take room
 * from a bar of quarters, or its ornaments spill past the barline.
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

/** Narrowest legible sixteenth, in points. */
const MIN_STEP_WIDTH = 20;

/**
 * What grace notes add to the step they lead into: still ink between strokes, so
 * a group costs room and each slot after the first a little more. Legibility
 * minimums like `MIN_STEP_WIDTH`, not measurements of any drawing.
 */
const MIN_GRACE_GROUP_WIDTH = 24;
const MIN_GRACE_SLOT_WIDTH = 8;

/**
 * Width a measure needs before crowding: a sixteenth per step plus ornaments.
 * Both voices' graces on one step stack vertically, so a step costs the busier
 * voice's ornament, not the sum.
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

/** Width a system of these measures needs before crowding. */
function minimumSystemWidth(measures: readonly Measure[]): number {
  const notes = measures.reduce((sum, measure) => sum + minimumMeasureWidth(measure), 0);
  return notes + CLEF_WIDTH + TIME_SIGNATURE_WIDTH + 2 * MARGIN_X;
}

/** Widest any one system would have to be at this many measures per system. */
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
 * Layout for a container of this width. Wrapping comes from the score's own
 * minimum legible width, not a measure count: a bar of drags needs room quarters
 * do not. Below one measure it stays at that minimum and scales down — a smaller
 * staff reads better than a clipped one.
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

/** One system, one width whatever the viewport says — widened only where the
 *  music will not fit, since a cut-off ornament is not a picture of the groove. */
export function exportStaffLayout(score: Score): StaffLayout {
  const measuresPerSystem = score.measures.length;
  return {
    width: Math.max(EXPORT_WIDTH, minimumWidthFor(score, measuresPerSystem)),
    measuresPerSystem,
  };
}
