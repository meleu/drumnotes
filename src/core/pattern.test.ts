import { describe, expect, it } from 'vitest';

import {
  BARS,
  DEFAULT_TEMPO,
  INSTRUMENTS,
  MAX_TEMPO,
  MIN_TEMPO,
  STEPS_PER_BAR,
  TOTAL_STEPS,
  barOfStep,
  clampTempo,
  defaultPattern,
  emptyPattern,
  gridBars,
  hasHits,
  instrumentsAt,
  toggleStep,
  withTempo,
  withoutHits,
} from './pattern.js';

/** The steps a lane sounds on, bar-relative, per bar. */
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

    // Hi-hat every eighth; snare on 2 and 4; kick on 1 and the "and" of 3.
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

describe('clampTempo', () => {
  it('leaves a playable tempo alone', () => {
    expect(clampTempo(120)).toBe(120);
    expect(clampTempo(MIN_TEMPO)).toBe(MIN_TEMPO);
    expect(clampTempo(MAX_TEMPO)).toBe(MAX_TEMPO);
  });

  it('pulls an out-of-range tempo back to the nearest end', () => {
    expect(clampTempo(999)).toBe(MAX_TEMPO);
    expect(clampTempo(1)).toBe(MIN_TEMPO);
    expect(clampTempo(-30)).toBe(MIN_TEMPO);
  });

  it('answers with a whole number of beats per minute', () => {
    expect(clampTempo(120.4)).toBe(120);
    expect(clampTempo(120.6)).toBe(121);
  });

  it('falls back to the default rather than passing on a non-number', () => {
    expect(clampTempo(Number.NaN)).toBe(DEFAULT_TEMPO);
    expect(clampTempo(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TEMPO);
  });
});

describe('withTempo', () => {
  it('sets the tempo through the clamp', () => {
    expect(withTempo(emptyPattern(), 120).tempo).toBe(120);
    expect(withTempo(emptyPattern(), 999).tempo).toBe(MAX_TEMPO);
  });

  it('returns a new pattern, leaving the input and its lanes untouched', () => {
    const before = defaultPattern();
    const after = withTempo(before, 140);

    expect(after).not.toBe(before);
    expect(before.tempo).toBe(DEFAULT_TEMPO);
    expect(after.lanes).toBe(before.lanes);
  });
});

describe('hasHits', () => {
  it('tells a written pattern from a silent one', () => {
    expect(hasHits(defaultPattern())).toBe(true);
    expect(hasHits(emptyPattern())).toBe(false);
  });

  it('counts a single hit in any lane as written', () => {
    for (const { id } of INSTRUMENTS) {
      expect(hasHits(toggleStep(emptyPattern(), id, TOTAL_STEPS - 1))).toBe(true);
    }
  });
});

describe('withoutHits', () => {
  it('silences every lane while the tempo plays on', () => {
    const before = withTempo(defaultPattern(), 140);
    const after = withoutHits(before);

    for (const { id } of INSTRUMENTS) {
      expect(after.lanes[id]).toHaveLength(TOTAL_STEPS);
      expect(after.lanes[id].some(Boolean)).toBe(false);
    }
    expect(after.tempo).toBe(140);
  });

  it('returns a new pattern and leaves the input untouched', () => {
    const before = defaultPattern();
    const after = withoutHits(before);

    expect(after).not.toBe(before);
    expect(before.lanes.hihat.some(Boolean)).toBe(true);
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

describe('barOfStep', () => {
  it('puts every step of a bar in that bar', () => {
    expect(barOfStep(0)).toBe(0);
    expect(barOfStep(STEPS_PER_BAR - 1)).toBe(0);
    expect(barOfStep(STEPS_PER_BAR)).toBe(1);
    expect(barOfStep(TOTAL_STEPS - 1)).toBe(BARS - 1);
  });
});
