import { describe, expect, test } from 'vitest';

import { STEPS_PER_BEAT, TOTAL_STEPS } from './pattern.js';
import { loopDuration, positionAt, retune, stepDuration, stepsInWindow } from './schedule.js';

/** 120 BPM makes a sixteenth exactly an eighth of a second — arithmetic by eye. */
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

    /* Ragged windows, as a wobbling timer would produce, but never overlapping
     * and never leaving a gap: each one opens where the last one closed. */
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

describe('positionAt', () => {
  test('counts steps from the origin, climbing on past the loop point', () => {
    expect(positionAt(LOOP, 0)).toBeCloseTo(0);
    expect(positionAt(LOOP, 2 * STEP)).toBeCloseTo(2);
    expect(positionAt(LOOP, (TOTAL_STEPS + 1) * STEP)).toBeCloseTo(TOTAL_STEPS + 1);
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
