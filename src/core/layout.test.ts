import { describe, expect, test } from 'vitest';

import { EXPORT_WIDTH } from './export.js';
import type { StaffLayout } from './layout.js';
import { exportStaffLayout, placeMeasures, staffLayoutFor, staffSize } from './layout.js';
import type { Score } from './score.js';

/** Layout reads nothing but the measure count, so the measures can be empty. */
function scoreOf(measures: number): Score {
  return { measures: Array.from({ length: measures }, (_, index) => ({ index, voices: [] })) };
}

/** Wider than any minimum this staff has, so the container is never the
 *  constraint. */
const ROOMY = 5000;

describe('staffLayoutFor', () => {
  test('keeps every measure on one system when there is room', () => {
    expect(staffLayoutFor(ROOMY, 4)).toEqual({ width: ROOMY, measuresPerSystem: 4 });
  });

  test('wraps to one measure a system in a container only one is legible in', () => {
    // What a lone measure is drawn at when the container offers nothing: the
    // narrowest one system can be, and so too narrow for two.
    const oneMeasure = staffLayoutFor(0, 1).width;

    expect(staffLayoutFor(oneMeasure, 2).measuresPerSystem).toBe(1);
  });

  test('floors at one measure a system, however narrow the container', () => {
    expect(staffLayoutFor(1, 4).measuresPerSystem).toBe(1);
  });

  test('stops following the container down, so the staff scales rather than clips', () => {
    const cramped = staffLayoutFor(50, 2);

    expect(cramped.width).toBeGreaterThan(50);
    // Below the floor the container stops mattering at all.
    expect(staffLayoutFor(10, 2).width).toBe(cramped.width);
  });

  test('is happy in a container of the width it asked for', () => {
    const floored = staffLayoutFor(50, 2);

    expect(staffLayoutFor(floored.width, 2)).toEqual(floored);
  });

  test('never returns a width narrower than the container it was given', () => {
    for (const containerWidth of [0, 100, 400, 700, 1000, 2000]) {
      expect(staffLayoutFor(containerWidth, 4).width).toBeGreaterThanOrEqual(containerWidth);
    }
  });
});

describe('placeMeasures', () => {
  const layout: StaffLayout = { width: 1000, measuresPerSystem: 2 };

  test('tiles a system horizontally, with no gap and no overlap', () => {
    const [first, second] = placeMeasures(scoreOf(2), layout);

    expect(second!.x).toBe(first!.x + first!.width);
  });

  test('tiles systems vertically, so shading one never tints the one below', () => {
    const [first, , third] = placeMeasures(scoreOf(4), layout);

    expect(third!.y).toBe(first!.y + first!.height);
  });

  test('opens every system with a clef, and only the piece with a time signature', () => {
    const placed = placeMeasures(scoreOf(4), layout);

    expect(placed.map(({ clef }) => clef)).toEqual([true, false, true, false]);
    expect(placed.map(({ timeSignature }) => timeSignature)).toEqual([true, false, false, false]);
  });

  test('gives the measures after a system opener equal room', () => {
    const [, second, third] = placeMeasures(scoreOf(3), { width: 1000, measuresPerSystem: 3 });

    expect(second!.width).toBe(third!.width);
  });

  test('pays for the clef and the time signature out of the opening measure alone', () => {
    const placed = placeMeasures(scoreOf(4), layout);
    const opensThePiece = placed[0]!.width - placed[1]!.width;
    const opensASystem = placed[2]!.width - placed[3]!.width;

    // A clef costs the measure that carries it...
    expect(opensASystem).toBeGreaterThan(0);
    // ...and the first measure of all pays for the time signature on top.
    expect(opensThePiece).toBeGreaterThan(opensASystem);
  });

  test('spends the whole width: a full system plus both margins', () => {
    const placed = placeMeasures(scoreOf(2), layout);
    const marginX = placed[0]!.x;
    const ink = placed.reduce((sum, { width }) => sum + width, 0);

    expect(ink + 2 * marginX).toBeCloseTo(layout.width);
  });

  test('places every measure even when asked for a nonsense system size', () => {
    for (const measuresPerSystem of [0, 0.5, -3]) {
      const placed = placeMeasures(scoreOf(3), { width: 1000, measuresPerSystem });

      expect(placed).toHaveLength(3);
      // One a system: each starts at the margin, one band below the last.
      expect(placed.map(({ x }) => x)).toEqual([placed[0]!.x, placed[0]!.x, placed[0]!.x]);
      expect(placed[1]!.y).toBe(placed[0]!.y + placed[0]!.height);
      expect(placed[2]!.y).toBe(placed[1]!.y + placed[1]!.height);
    }
  });
});

describe('staffSize', () => {
  const layout: StaffLayout = { width: 800, measuresPerSystem: 1 };

  test('is as wide as the layout says', () => {
    expect(staffSize(scoreOf(3), layout).width).toBe(layout.width);
  });

  test('grows by exactly one band a system, so the bands account for the height', () => {
    const band = placeMeasures(scoreOf(1), layout)[0]!.height;

    expect(staffSize(scoreOf(2), layout).height - staffSize(scoreOf(1), layout).height).toBe(band);
  });
});

describe('exportStaffLayout', () => {
  test('puts the whole score on one system at the export width, whatever the viewport', () => {
    for (const measures of [1, 2, 8]) {
      expect(exportStaffLayout(scoreOf(measures))).toEqual({
        width: EXPORT_WIDTH,
        measuresPerSystem: measures,
      });
    }
  });
});
