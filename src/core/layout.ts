/**
 * Where the notation lands on the page: systems, measure widths, and the patch
 * each measure occupies. Pure — no VexFlow, no DOM. The drawing and anything
 * overlaid on it read the same placements, so they cannot disagree about where
 * a measure is.
 */

import { EXPORT_WIDTH } from './export.js';
import { BEATS_PER_BAR, STEPS_PER_BEAT } from './pattern.js';
import type { Score } from './score.js';

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

    const widths = measureWidths(Math.min(perSystem, count - start), system === 0, layout);
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

export interface MeasureFurniture {
  readonly clef: boolean;
  readonly timeSignature: boolean;
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

/** One system, fixed width, whatever the viewport says. */
export function exportStaffLayout(score: Score): StaffLayout {
  return { width: EXPORT_WIDTH, measuresPerSystem: score.measures.length };
}
