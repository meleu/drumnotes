import { describe, expect, it } from 'vitest';

import {
  BARS,
  DEFAULT_TEMPO,
  INSTRUMENTS,
  STEPS_PER_BAR,
  TOTAL_STEPS,
  defaultPattern,
  emptyPattern,
  gridBars,
  instrumentsAt,
  toggleStep,
} from './pattern.js';

/** The steps a lane sounds on, as a bar-relative list, asserted per bar. */
function hitsPerBar(lane: readonly boolean[]): number[][] {
  return Array.from({ length: BARS }, (_, bar) =>
    lane
      .slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR)
      .flatMap((filled, step) => (filled ? [step] : [])),
  );
}

describe('emptyPattern', () => {
  it('has one silent lane per instrument, spanning every step in the pattern', () => {
    const pattern = emptyPattern();

    expect(Object.keys(pattern.lanes)).toEqual(INSTRUMENTS.map((i) => i.id));
    for (const { id } of INSTRUMENTS) {
      expect(pattern.lanes[id]).toHaveLength(TOTAL_STEPS);
      expect(pattern.lanes[id].some(Boolean)).toBe(false);
    }
  });

  it('derives its length from the bar constants', () => {
    expect(TOTAL_STEPS).toBe(BARS * STEPS_PER_BAR);
  });

  it('starts at the default tempo', () => {
    expect(emptyPattern().tempo).toBe(DEFAULT_TEMPO);
  });
});

describe('defaultPattern', () => {
  it('is a straight eighth-note rock beat, the same in every bar', () => {
    const { lanes } = defaultPattern();

    // Hi-hat on every eighth; snare on 2 and 4; kick on 1 and the "and" of 3.
    expect(hitsPerBar(lanes.hihat)).toEqual(
      Array.from({ length: BARS }, () => [0, 2, 4, 6, 8, 10, 12, 14]),
    );
    expect(hitsPerBar(lanes.snare)).toEqual(Array.from({ length: BARS }, () => [4, 12]));
    expect(hitsPerBar(lanes.kick)).toEqual(Array.from({ length: BARS }, () => [0, 10]));
  });

  it('plays at the default tempo and spans the whole pattern', () => {
    const pattern = defaultPattern();

    expect(pattern.tempo).toBe(DEFAULT_TEMPO);
    for (const { id } of INSTRUMENTS) {
      expect(pattern.lanes[id]).toHaveLength(TOTAL_STEPS);
    }
  });
});

describe('gridBars', () => {
  it('splits the pattern into bars of consecutive steps, boundaries derived', () => {
    const bars = gridBars();

    expect(bars).toHaveLength(BARS);
    expect(bars.map((bar) => bar.index)).toEqual([...bars.keys()]);
    expect(bars.flatMap((bar) => bar.steps.map((s) => s.index))).toEqual([
      ...Array(TOTAL_STEPS).keys(),
    ]);
    for (const bar of bars) {
      expect(bar.steps).toHaveLength(STEPS_PER_BAR);
    }
  });

  it('labels each step with the counting a drummer uses, restarting every bar', () => {
    const labels = gridBars().map((bar) => bar.steps.map((s) => s.label).join(' '));

    expect(labels).toEqual(['1 e + a 2 e + a 3 e + a 4 e + a', '1 e + a 2 e + a 3 e + a 4 e + a']);
  });

  it('marks the first step of every beat', () => {
    const beatStarts = gridBars()
      .flatMap((bar) => bar.steps)
      .filter((step) => step.isBeatStart)
      .map((step) => step.index);

    expect(beatStarts).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
  });
});

describe('toggleStep', () => {
  it('fills an empty step and clears a filled one', () => {
    const filled = toggleStep(emptyPattern(), 'snare', 4);
    expect(filled.lanes.snare[4]).toBe(true);

    const cleared = toggleStep(filled, 'snare', 4);
    expect(cleared.lanes.snare[4]).toBe(false);
  });

  it('returns a new pattern and leaves the input untouched', () => {
    const before = emptyPattern();
    const after = toggleStep(before, 'kick', 0);

    expect(after).not.toBe(before);
    expect(after.lanes.kick).not.toBe(before.lanes.kick);
    expect(before.lanes.kick[0]).toBe(false);
  });

  it('leaves the other lanes and every other step alone', () => {
    const before = toggleStep(emptyPattern(), 'hihat', 2);
    const after = toggleStep(before, 'snare', 7);

    expect(after.lanes.hihat).toEqual(before.lanes.hihat);
    expect(after.lanes.kick).toEqual(before.lanes.kick);
    expect(after.lanes.snare.filter(Boolean)).toHaveLength(1);
    expect(after.tempo).toBe(before.tempo);
  });
});

describe('instrumentsAt', () => {
  it('names everything written on a step, in row order', () => {
    const pattern = defaultPattern();

    expect(instrumentsAt(pattern, 0)).toEqual(['hihat', 'kick']);
    expect(instrumentsAt(pattern, 4)).toEqual(['hihat', 'snare']);
  });

  it('names nothing on a silent step', () => {
    expect(instrumentsAt(emptyPattern(), 3)).toEqual([]);
  });
});
