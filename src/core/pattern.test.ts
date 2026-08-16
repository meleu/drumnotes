import { describe, expect, it } from 'vitest';

import type { Articulation } from './pattern.js';
import {
  ARTICULATION_CHOICES,
  ARTICULATIONS,
  BARS,
  DEFAULT_TEMPO,
  DYNAMICS,
  INSTRUMENTS,
  MAX_TEMPO,
  MIN_TEMPO,
  STEPS_PER_BAR,
  TOTAL_STEPS,
  anythingWritten,
  articulationAt,
  barOfStep,
  clampTempo,
  defaultPattern,
  emptyPattern,
  gridBars,
  hitsOf,
  isWritten,
  soundsAt,
  toggleStep,
  withArticulation,
  withNothingWritten,
  withTempo,
} from './pattern.js';

/** The steps a lane is written on, bar-relative, per bar. */
function hitsPerBar(lane: readonly Articulation[]): number[][] {
  return Array.from({ length: BARS }, (_, bar) =>
    lane
      .slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR)
      .flatMap((articulation, step) => (articulation === 'empty' ? [] : [step])),
  );
}

function isSilent(lane: readonly Articulation[]): boolean {
  return lane.every((articulation) => articulation === 'empty');
}

describe('ARTICULATIONS', () => {
  it('is the whole vocabulary a cell can hold, silence first', () => {
    expect(ARTICULATIONS).toEqual(['empty', 'normal', 'accent', 'ghost', 'flam', 'drag']);
  });
});

describe('emptyPattern', () => {
  it('has one silent lane per instrument, spanning every step in the pattern', () => {
    const pattern = emptyPattern();

    expect(Object.keys(pattern.lanes)).toEqual(INSTRUMENTS.map((i) => i.id));
    for (const { id } of INSTRUMENTS) {
      expect(pattern.lanes[id]).toHaveLength(TOTAL_STEPS);
      expect(isSilent(pattern.lanes[id])).toBe(true);
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
  it('writes every cell of the landing groove as a plain hit', () => {
    const { lanes } = defaultPattern();

    for (const { id } of INSTRUMENTS) {
      expect(new Set(lanes[id])).toEqual(new Set<Articulation>(['empty', 'normal']));
    }
  });

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

describe('articulationAt', () => {
  it('reads what a cell holds', () => {
    expect(articulationAt(defaultPattern(), 'snare', 4)).toBe('normal');
    expect(articulationAt(defaultPattern(), 'snare', 5)).toBe('empty');
  });
});

describe('ARTICULATION_CHOICES', () => {
  it('offers silence first, then the articulations the app can write', () => {
    expect(ARTICULATION_CHOICES.map(({ id }) => id)).toEqual([
      'empty',
      'normal',
      'accent',
      'ghost',
    ]);
  });

  it('offers each articulation at most once, and none the pattern cannot hold', () => {
    const offered = ARTICULATION_CHOICES.map(({ id }) => id);

    expect(new Set(offered).size).toBe(offered.length);
    for (const id of offered) expect(ARTICULATIONS).toContain(id);
  });

  it('names every choice it offers', () => {
    for (const { name } of ARTICULATION_CHOICES) expect(name).not.toBe('');
  });
});

describe('isWritten', () => {
  it('is true of every articulation but silence', () => {
    for (const articulation of ARTICULATIONS) {
      const pattern = withArticulation(emptyPattern(), 'snare', 4, articulation);

      expect(isWritten(pattern, 'snare', 4)).toBe(articulation !== 'empty');
    }
  });
});

describe('toggleStep', () => {
  it('writes a plain hit on an empty step', () => {
    expect(articulationAt(toggleStep(emptyPattern(), 'snare', 4), 'snare', 4)).toBe('normal');
  });

  it('rubs out a written step, whatever it held', () => {
    for (const articulation of ARTICULATIONS.filter((value) => value !== 'empty')) {
      const written = withArticulation(emptyPattern(), 'snare', 4, articulation);

      expect(articulationAt(toggleStep(written, 'snare', 4), 'snare', 4)).toBe('empty');
    }
  });

  it('returns a new pattern and leaves the input untouched', () => {
    const before = emptyPattern();
    const after = toggleStep(before, 'kick', 0);

    expect(after).not.toBe(before);
    expect(after.lanes.kick).not.toBe(before.lanes.kick);
    expect(before.lanes.kick[0]).toBe('empty');
  });

  it('leaves the other lanes and every other step alone', () => {
    const before = toggleStep(emptyPattern(), 'hihat', 2);
    const after = toggleStep(before, 'snare', 7);

    expect(after.lanes.hihat).toEqual(before.lanes.hihat);
    expect(after.lanes.kick).toEqual(before.lanes.kick);
    expect(after.lanes.snare.filter((cell) => cell !== 'empty')).toHaveLength(1);
    expect(after.tempo).toBe(before.tempo);
  });
});

describe('withArticulation', () => {
  it('sets any articulation of the vocabulary on a cell', () => {
    for (const articulation of ARTICULATIONS) {
      const pattern = withArticulation(defaultPattern(), 'hihat', 3, articulation);

      expect(articulationAt(pattern, 'hihat', 3)).toBe(articulation);
    }
  });

  it('replaces whatever the cell held, silence included', () => {
    const accented = withArticulation(emptyPattern(), 'kick', 8, 'accent');

    expect(articulationAt(withArticulation(accented, 'kick', 8, 'ghost'), 'kick', 8)).toBe('ghost');
    expect(articulationAt(withArticulation(accented, 'kick', 8, 'empty'), 'kick', 8)).toBe('empty');
  });

  it('returns a new pattern and leaves the input untouched', () => {
    const before = emptyPattern();
    const after = withArticulation(before, 'kick', 0, 'flam');

    expect(after).not.toBe(before);
    expect(after.lanes.snare).toBe(before.lanes.snare);
    expect(before.lanes.kick[0]).toBe('empty');
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

describe('anythingWritten', () => {
  it('tells a written pattern from a silent one', () => {
    expect(anythingWritten(defaultPattern())).toBe(true);
    expect(anythingWritten(emptyPattern())).toBe(false);
  });

  it('counts a single cell of any articulation in any lane as written', () => {
    for (const { id } of INSTRUMENTS) {
      for (const articulation of ARTICULATIONS.filter((value) => value !== 'empty')) {
        const pattern = withArticulation(emptyPattern(), id, TOTAL_STEPS - 1, articulation);

        expect(anythingWritten(pattern)).toBe(true);
      }
    }
  });
});

describe('withNothingWritten', () => {
  it('empties every cell of every articulation while the tempo plays on', () => {
    const before = ARTICULATIONS.reduce(
      (pattern, articulation, index) => withArticulation(pattern, 'snare', index, articulation),
      withTempo(defaultPattern(), 140),
    );
    const after = withNothingWritten(before);

    for (const { id } of INSTRUMENTS) {
      expect(after.lanes[id]).toHaveLength(TOTAL_STEPS);
      expect(isSilent(after.lanes[id])).toBe(true);
    }
    expect(after.tempo).toBe(140);
  });

  it('returns a new pattern and leaves the input untouched', () => {
    const before = defaultPattern();
    const after = withNothingWritten(before);

    expect(after).not.toBe(before);
    expect(isSilent(before.lanes.hihat)).toBe(false);
  });
});

describe('soundsAt', () => {
  it('sounds everything written on a step, in row order', () => {
    const pattern = defaultPattern();

    expect(soundsAt(pattern, 0)).toEqual([
      { instrument: 'hihat', dynamic: 'plain' },
      { instrument: 'kick', dynamic: 'plain' },
    ]);
    expect(soundsAt(pattern, 4)).toEqual([
      { instrument: 'hihat', dynamic: 'plain' },
      { instrument: 'snare', dynamic: 'plain' },
    ]);
  });

  it('sounds an accent at its own dynamic', () => {
    const pattern = withArticulation(emptyPattern(), 'snare', 4, 'accent');

    expect(soundsAt(pattern, 4)).toEqual([{ instrument: 'snare', dynamic: 'hardest' }]);
  });

  it('sounds a ghost note at its own dynamic', () => {
    const pattern = withArticulation(emptyPattern(), 'snare', 4, 'ghost');

    expect(soundsAt(pattern, 4)).toEqual([{ instrument: 'snare', dynamic: 'softest' }]);
  });

  it('sounds nothing on a silent step', () => {
    expect(soundsAt(emptyPattern(), 3)).toEqual([]);
  });
});

describe('DYNAMICS', () => {
  it('runs from softest to hardest', () => {
    expect(DYNAMICS).toEqual(['softest', 'plain', 'hard', 'hardest']);
  });
});

describe('hitsOf', () => {
  it('plays silence as no hit at all', () => {
    expect(hitsOf('empty')).toEqual([]);
  });

  it('plays a plain hit on the step, plainly', () => {
    expect(hitsOf('normal')).toEqual([{ leads: 0, dynamic: 'plain' }]);
  });

  it('plays an accent on the step, at the hardest recording', () => {
    expect(hitsOf('accent')).toEqual([{ leads: 0, dynamic: 'hardest' }]);
  });

  it('plays a ghost note on the step, at the softest recording', () => {
    expect(hitsOf('ghost')).toEqual([{ leads: 0, dynamic: 'softest' }]);
  });

  it('names a dynamic for every hit of every articulation', () => {
    for (const articulation of ARTICULATIONS) {
      for (const hit of hitsOf(articulation)) {
        expect(DYNAMICS).toContain(hit.dynamic);
        expect(hit.leads).toBeGreaterThanOrEqual(0);
      }
    }
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
