import { describe, expect, test } from 'vitest';

import type { Pattern } from './pattern.js';
import {
  ARTICULATIONS,
  MAX_TEMPO,
  MIN_TEMPO,
  STEPS_PER_BEAT,
  TOTAL_STEPS,
  emptyPattern,
  hitsAt,
  withArticulation,
} from './pattern.js';
import type { ScheduledSound } from './schedule.js';
import {
  auditionOf,
  graceLead,
  longestLead,
  loopDuration,
  positionAt,
  retune,
  soundsInWindow,
  stepAt,
  stepDuration,
  stepsInWindow,
} from './schedule.js';

/** At 120 BPM a sixteenth is exactly an eighth of a second: arithmetic by eye. */
const LOOP = { tempo: 120, origin: 0 };
const STEP = 0.125;

describe('durations', () => {
  test('a sixteenth is a quarter of a beat', () => {
    expect(stepDuration(120)).toBeCloseTo(60 / 120 / STEPS_PER_BEAT);
    expect(stepDuration(90)).toBeCloseTo(60 / 90 / STEPS_PER_BEAT);
  });

  test('a loop is every step of the pattern', () => {
    expect(loopDuration(120)).toBeCloseTo(TOTAL_STEPS * STEP);
  });
});

describe('graceLead', () => {
  /** Every playable tempo, since the whole question is where the cap bites. */
  const TEMPOS = Array.from({ length: MAX_TEMPO - MIN_TEMPO + 1 }, (_, i) => MIN_TEMPO + i);

  test('is the same sliver of real time wherever a step is long enough to hold it', () => {
    // A flam is a gesture of the hand: it does not scale with the tempo.
    expect(graceLead(MIN_TEMPO)).toBeCloseTo(0.03);
    expect(graceLead(90)).toBeCloseTo(0.03);
    expect(graceLead(120)).toBeCloseTo(0.03);
  });

  test('tightens to a third of a step at the top of the range', () => {
    expect(graceLead(MAX_TEMPO)).toBeCloseTo(stepDuration(MAX_TEMPO) / 3);
    expect(graceLead(MAX_TEMPO)).toBeLessThan(0.03);
  });

  test('never asks for more than a third of a step, at any tempo', () => {
    // Which is what keeps a drag's two leads clear of the sixteenth before.
    for (const tempo of TEMPOS) {
      expect(`${tempo}: ${graceLead(tempo) <= stepDuration(tempo) / 3}`).toBe(`${tempo}: true`);
    }
  });

  test('leaves the longest lead the vocabulary allows short of a whole step', () => {
    for (const tempo of TEMPOS) {
      expect(`${tempo}: ${longestLead(tempo) < stepDuration(tempo)}`).toBe(`${tempo}: true`);
    }
  });
});

describe('stepsInWindow', () => {
  test('finds nothing in a window that falls between two steps', () => {
    expect(stepsInWindow(LOOP, 0.01, 0.12)).toEqual([]);
    expect(stepsInWindow(LOOP, 0.25, 0.25)).toEqual([]);
  });

  test('lists every step a window covers, with the time it sounds', () => {
    const found = stepsInWindow(LOOP, 0, 0.3);

    expect(found.map((hit) => hit.step)).toEqual([0, 1, 2]);
    expect(found.map((hit) => hit.time)).toEqual([0, STEP, 2 * STEP]);
  });

  test('wraps back to the first step across the loop point without repeating a time', () => {
    const loopEnd = TOTAL_STEPS * STEP;
    const found = stepsInWindow(LOOP, loopEnd - STEP / 2, loopEnd + 1.5 * STEP);

    expect(found.map((hit) => hit.step)).toEqual([0, 1]);
    expect(found.map((hit) => hit.time)).toEqual([loopEnd, loopEnd + STEP]);
  });

  test('gives a step landing on a window edge to the window that opens on it', () => {
    const opening = stepsInWindow(LOOP, 0, STEP);
    const next = stepsInWindow(LOOP, STEP, 2 * STEP);

    expect(opening.map((hit) => hit.step)).toEqual([0]);
    expect(next.map((hit) => hit.step)).toEqual([1]);
  });

  test('honours an origin later than the clock started', () => {
    const found = stepsInWindow({ tempo: 120, origin: 10 }, 10, 10 + 2 * STEP);

    expect(found.map((hit) => hit.step)).toEqual([0, 1]);
    expect(found.map((hit) => hit.time)).toEqual([10, 10 + STEP]);
  });

  test('schedules every step exactly once across a long run of consecutive windows', () => {
    const loop = { tempo: 138, origin: 3.7 };
    const step = stepDuration(loop.tempo);
    const passes = 5;

    /* Ragged windows, as a wobbling timer produces, but never overlapping or
     * gapping: each opens where the last closed. */
    const played: number[] = [];
    let cursor = loop.origin;
    let width = 0.02;
    while (cursor < loop.origin + passes * loopDuration(loop.tempo)) {
      const until = cursor + width;
      for (const hit of stepsInWindow(loop, cursor, until)) played.push(hit.step);
      cursor = until;
      width = ((width * 7) % 0.19) + 0.005;
    }

    const expected = Array.from(
      { length: passes * TOTAL_STEPS },
      (_, index) => index % TOTAL_STEPS,
    );
    expect(played.slice(0, expected.length)).toEqual(expected);
    expect(played.length).toBeGreaterThanOrEqual(expected.length);
    expect(step).toBeGreaterThan(0);
  });
});

describe('soundsInWindow', () => {
  /** A hi-hat on every step: one plain sound per step, so the window's own
   *  arithmetic is all that can vary. */
  const straight = (): Pattern =>
    [...Array(TOTAL_STEPS).keys()].reduce(
      (pattern, step) => withArticulation(pattern, 'hihat', step, 'normal'),
      emptyPattern(),
    );

  const flammed = (step: number): Pattern =>
    withArticulation(emptyPattern(), 'snare', step, 'flam');

  test('hands over every sound of every step the window covers, at its own time', () => {
    const found = soundsInWindow(LOOP, straight(), 0, 3 * STEP);

    expect(found).toEqual([
      { instrument: 'hihat', dynamic: 'plain', time: 0 },
      { instrument: 'hihat', dynamic: 'plain', time: STEP },
      { instrument: 'hihat', dynamic: 'plain', time: 2 * STEP },
    ]);
  });

  test('finds nothing on a silent pattern, however wide the window', () => {
    expect(soundsInWindow(LOOP, emptyPattern(), 0, 4 * STEP)).toEqual([]);
  });

  test('leads a flam by one grace lead and lands its own hit exactly on the step', () => {
    const lead = graceLead(LOOP.tempo);
    const found = soundsInWindow(LOOP, flammed(4), 4 * STEP, 5 * STEP);

    expect(found).toEqual([
      { instrument: 'snare', dynamic: 'softest', time: 4 * STEP - lead },
      { instrument: 'snare', dynamic: 'hard', time: 4 * STEP },
    ]);
  });

  test('keeps a flam at the top of the tempo range clear of the sixteenth before it', () => {
    const loop = { tempo: MAX_TEMPO, origin: 0 };
    const step = stepDuration(MAX_TEMPO);
    const [grace] = soundsInWindow(loop, flammed(4), 4 * step, 5 * step);

    expect(grace!.time).toBeGreaterThan(3 * step);
  });

  test('gives a step on a window edge to the window opening on it, grace hit and all', () => {
    const lead = graceLead(LOOP.tempo);
    const opening = soundsInWindow(LOOP, flammed(4), 3 * STEP, 4 * STEP);
    const next = soundsInWindow(LOOP, flammed(4), 4 * STEP, 5 * STEP);

    // The grace hit sounds before the window that hands it over: a sound
    // belongs to the window that owns its step, never to the window its own
    // time falls in (ADR 0006).
    expect(opening).toEqual([]);
    expect(next.map(({ time }) => time)).toEqual([4 * STEP - lead, 4 * STEP]);
  });

  test('hands every sound over exactly once across a long run of consecutive windows', () => {
    const loop = { tempo: 138, origin: 3.7 };
    const lead = graceLead(loop.tempo);
    const step = stepDuration(loop.tempo);
    const pattern = withArticulation(straight(), 'snare', 4, 'flam');
    const passes = 3;

    /* Ragged windows, as a wobbling timer produces, but never overlapping or
     * gapping: each opens where the last closed. */
    const played: ScheduledSound[] = [];
    let cursor = loop.origin;
    let width = 0.02;
    while (cursor < loop.origin + passes * loopDuration(loop.tempo)) {
      const until = cursor + width;
      played.push(...soundsInWindow(loop, pattern, cursor, until));
      cursor = until;
      width = ((width * 7) % 0.19) + 0.005;
    }

    const expected = Array.from({ length: passes * TOTAL_STEPS }, (_, index) =>
      hitsAt(pattern, index % TOTAL_STEPS).map(({ instrument, dynamic, leads }) => ({
        instrument,
        dynamic,
        time: loop.origin + index * step - leads * lead,
      })),
    )
      .flat()
      // Earliest first, as they are handed over: a grace hit precedes the plain
      // hits of its own step.
      .sort((a, b) => a.time - b.time);

    expect(played.slice(0, expected.length)).toEqual(expected);
    expect(played.length).toBeGreaterThanOrEqual(expected.length);
  });

  test('neither drops nor doubles a sound when the tempo changes at a window seam', () => {
    const at = 4 * STEP;
    const pattern = withArticulation(straight(), 'snare', 4, 'flam');
    const before = soundsInWindow(LOOP, pattern, 0, at);
    const faster = retune(LOOP, 200, at);
    // Half a step past the fourth, so the window's far edge lands nowhere near
    // a step and the seam is the only boundary under test.
    const after = soundsInWindow(faster, pattern, at, at + 3.5 * stepDuration(200));

    // Four plain steps, then the flammed one — its grace hit ahead of the
    // hi-hat it is struck with — then three more.
    expect([...before, ...after].map(({ dynamic }) => dynamic)).toEqual([
      'plain',
      'plain',
      'plain',
      'plain',
      'softest',
      'plain',
      'hard',
      'plain',
      'plain',
      'plain',
    ]);
    const times = [...before, ...after].map(({ time }) => time);
    expect(times.toSorted((a, b) => a - b)).toEqual(times);
  });

  test('orders a window by the moment each sound is due', () => {
    const pattern = withArticulation(straight(), 'snare', 1, 'flam');
    const times = soundsInWindow(LOOP, pattern, 0, 3 * STEP).map(({ time }) => time);

    expect(times.toSorted((a, b) => a - b)).toEqual(times);
  });
});

describe('auditionOf', () => {
  test('sounds a plain hit once, at once', () => {
    expect(auditionOf('normal', LOOP.tempo)).toEqual([{ dynamic: 'plain', delay: 0 }]);
  });

  test('sounds silence as nothing at all', () => {
    expect(auditionOf('empty', LOOP.tempo)).toEqual([]);
  });

  test('sounds a flam as a flam: the grace hit at once, the hit it leads into a lead later', () => {
    // An audition has no step coming to sound before, so the ornament starts
    // where the tap did and the hit it leads into follows.
    expect(auditionOf('flam', LOOP.tempo)).toEqual([
      { dynamic: 'softest', delay: 0 },
      { dynamic: 'hard', delay: graceLead(LOOP.tempo) },
    ]);
  });

  test('begins every articulation at once, and never reaches backwards', () => {
    for (const articulation of ARTICULATIONS) {
      const hits = auditionOf(articulation, LOOP.tempo);
      if (hits.length === 0) continue;

      expect(hits[0]!.delay).toBe(0);
      expect(hits.map(({ delay }) => delay).toSorted((a, b) => a - b)).toEqual(
        hits.map(({ delay }) => delay),
      );
    }
  });
});

describe('positionAt', () => {
  test('counts steps from the origin, climbing on past the loop point', () => {
    expect(positionAt(LOOP, 0)).toBeCloseTo(0);
    expect(positionAt(LOOP, 2 * STEP)).toBeCloseTo(2);
    expect(positionAt(LOOP, (TOTAL_STEPS + 1) * STEP)).toBeCloseTo(TOTAL_STEPS + 1);
  });
});

describe('stepAt', () => {
  test('holds a step for its whole length, from the moment it sounds', () => {
    expect(stepAt(LOOP, 0)).toBe(0);
    expect(stepAt(LOOP, STEP * 0.99)).toBe(0);
    expect(stepAt(LOOP, STEP)).toBe(1);
  });

  test('wraps round with the loop', () => {
    expect(stepAt(LOOP, (TOTAL_STEPS - 1) * STEP)).toBe(TOTAL_STEPS - 1);
    expect(stepAt(LOOP, TOTAL_STEPS * STEP)).toBe(0);
    expect(stepAt(LOOP, (TOTAL_STEPS + 3) * STEP)).toBe(3);
  });

  test('names the step whose hits a moment falls among', () => {
    /* Eye and ear shown the same thing: the step the scheduler gave this moment
     * is the step lit at it. */
    const [hit] = stepsInWindow(LOOP, 7 * STEP, 8 * STEP);

    expect(stepAt(LOOP, hit!.time)).toBe(hit!.step);
  });

  test('reads a moment before the loop began as the pass that has not started', () => {
    expect(stepAt(LOOP, -STEP)).toBe(TOTAL_STEPS - 1);
  });
});

describe('retune', () => {
  test('holds the same place in the pattern at the moment of the change', () => {
    const at = 5 * STEP;
    const faster = retune(LOOP, 180, at);

    expect(faster.tempo).toBe(180);
    expect(positionAt(faster, at)).toBeCloseTo(positionAt(LOOP, at));
  });

  test('runs at the new tempo from there on', () => {
    const at = 5 * STEP;
    const faster = retune(LOOP, 240, at);
    const step = stepDuration(240);

    expect(stepsInWindow(faster, at, at + 2 * step).map((hit) => hit.time)).toEqual([
      at,
      at + step,
    ]);
  });

  test('neither repeats nor skips a step across the change', () => {
    const at = 5 * STEP;
    const before = stepsInWindow(LOOP, 0, at).map((hit) => hit.step);
    const faster = retune(LOOP, 200, at);
    const after = stepsInWindow(faster, at, at + 3 * stepDuration(200)).map((hit) => hit.step);

    expect([...before, ...after]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
