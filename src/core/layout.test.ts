import { describe, expect, test } from 'vitest';

import { EXPORT_WIDTH } from './export.js';
import type { StaffLayout } from './layout.js';
import { exportStaffLayout, placeMeasures, staffLayoutFor, staffSize } from './layout.js';
import { STEPS_PER_BAR } from './pattern.js';
import type { Measure, Score } from './score.js';

/** A score of plain measures: layout reads the measure count and what is
 *  ornamented in them, and nothing else. */
function scoreOf(measures: number): Score {
  return { measures: Array.from({ length: measures }, (_, index) => ({ index, voices: [] })) };
}

/**
 * A measure of sixteenths, one voice per argument, each written as the grace
 * slots leading its stroke on every step. Layout reads nothing else off an
 * entry — not its heads, not what it is worth.
 */
function measureOf(...voices: readonly (readonly number[])[]): Measure {
  return {
    index: 0,
    voices: voices.map((slots, voiceIndex) => ({
      id: voiceIndex === 0 ? 'hands' : 'feet',
      stem: voiceIndex === 0 ? 'up' : 'down',
      beamGroups: [],
      entries: slots.map((count, step) => ({
        kind: 'note',
        startStep: step,
        duration: 'sixteenth',
        dots: 0,
        noteheads: [],
        accented: false,
        graces: Array.from({ length: count }, () => []),
      })),
    })),
  };
}

/** Sixteen steps of one articulation, as grace slots: none for a plain hit, one
 *  for a flam, two for a drag. */
function everyStep(slots: number): readonly number[] {
  return Array.from({ length: STEPS_PER_BAR }, () => slots);
}

function scoreWith(...measures: readonly Measure[]): Score {
  return { measures: measures.map((measure, index) => ({ ...measure, index })) };
}

/** Wider than any minimum this staff has, so the container is never the
 *  constraint. */
const ROOMY = 5000;

describe('staffLayoutFor', () => {
  test('keeps every measure on one system when there is room', () => {
    expect(staffLayoutFor(ROOMY, scoreOf(4))).toEqual({ width: ROOMY, measuresPerSystem: 4 });
  });

  test('wraps to one measure a system in a container only one is legible in', () => {
    // What a lone measure is drawn at when the container offers nothing: the
    // narrowest one system can be, and so too narrow for two.
    const oneMeasure = staffLayoutFor(0, scoreOf(1)).width;

    expect(staffLayoutFor(oneMeasure, scoreOf(2)).measuresPerSystem).toBe(1);
  });

  test('floors at one measure a system, however narrow the container', () => {
    expect(staffLayoutFor(1, scoreOf(4)).measuresPerSystem).toBe(1);
  });

  test('stops following the container down, so the staff scales rather than clips', () => {
    const cramped = staffLayoutFor(50, scoreOf(2));

    expect(cramped.width).toBeGreaterThan(50);
    // Below the floor the container stops mattering at all.
    expect(staffLayoutFor(10, scoreOf(2)).width).toBe(cramped.width);
  });

  test('is happy in a container of the width it asked for', () => {
    const floored = staffLayoutFor(50, scoreOf(2));

    expect(staffLayoutFor(floored.width, scoreOf(2))).toEqual(floored);
  });

  test('never returns a width narrower than the container it was given', () => {
    for (const containerWidth of [0, 100, 400, 700, 1000, 2000]) {
      expect(staffLayoutFor(containerWidth, scoreOf(4)).width).toBeGreaterThanOrEqual(
        containerWidth,
      );
    }
  });

  test('asks for more room the more a measure is ornamented', () => {
    // The narrowest each is legible at, with the container out of the way.
    const widths = [0, 1, 2].map(
      (slots) => staffLayoutFor(0, scoreWith(measureOf(everyStep(slots)))).width,
    );

    expect(widths[1]!).toBeGreaterThan(widths[0]!);
    expect(widths[2]!).toBeGreaterThan(widths[1]!);
  });

  test('charges a step for the busier voice on it, not for both', () => {
    const oneVoice = scoreWith(measureOf(everyStep(2)));
    const both = scoreWith(measureOf(everyStep(2), everyStep(2)));

    // Grace notes on the same step of both voices are drawn one above the
    // other, so the second voice costs the measure no width at all.
    expect(staffLayoutFor(0, both).width).toBe(staffLayoutFor(0, oneVoice).width);
  });

  test('wraps sooner when the measures are ornamented than when they are plain', () => {
    const plain = scoreWith(measureOf(everyStep(0)), measureOf(everyStep(0)));
    // Twice what a lone measure asks for, which is more than a system of two
    // needs: the clef and the time signature are paid for once, not twice.
    const room = 2 * staffLayoutFor(0, plain).width;

    // A container that holds two plain measures holds only one of drags.
    expect(staffLayoutFor(room, plain).measuresPerSystem).toBe(2);
    expect(
      staffLayoutFor(room, scoreWith(measureOf(everyStep(2)), measureOf(everyStep(2))))
        .measuresPerSystem,
    ).toBe(1);
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

  test('gives an ornamented measure more of the system than the plain one beside it', () => {
    const [plain, ornamented] = placeMeasures(
      scoreWith(measureOf(everyStep(0)), measureOf(everyStep(2))),
      layout,
    );

    // And more even though the plain one opens the system and is paid for the
    // clef and the time signature on top: the drags have to be drawn somewhere.
    expect(ornamented!.width).toBeGreaterThan(plain!.width);
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
    for (const measures of [1, 2, 3]) {
      expect(exportStaffLayout(scoreOf(measures))).toEqual({
        width: EXPORT_WIDTH,
        measuresPerSystem: measures,
      });
    }
  });

  test('widens for music the export width cannot hold, rather than cutting it off', () => {
    const dragged = scoreWith(measureOf(everyStep(2)), measureOf(everyStep(2)));

    const { width, measuresPerSystem } = exportStaffLayout(dragged);
    expect(width).toBeGreaterThan(EXPORT_WIDTH);
    // Still one system: a wider picture, not a taller one.
    expect(measuresPerSystem).toBe(dragged.measures.length);
  });
});
