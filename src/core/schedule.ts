/**
 * Playback arithmetic: which steps sound between two moments, at a tempo,
 * looping forever. Pure — no audio, no timers, no lookahead policy.
 *
 * Times are whatever clock the caller keeps: the audio clock in the app, plain
 * numbers in a test.
 */

import { STEPS_PER_BEAT, TOTAL_STEPS } from './pattern.js';

const SECONDS_PER_MINUTE = 60;

/** Seconds per sixteenth-note step. */
export function stepDuration(tempo: number): number {
  return SECONDS_PER_MINUTE / tempo / STEPS_PER_BEAT;
}

/** Seconds per pass through the whole pattern. */
export function loopDuration(tempo: number): number {
  return TOTAL_STEPS * stepDuration(tempo);
}

export interface Loop {
  readonly tempo: number;
  /** When step 0 of the first pass sounds. */
  readonly origin: number;
}

export interface ScheduledStep {
  /** Index into a lane, wrapped however many passes deep. */
  readonly step: number;
  /** Absolute time, still climbing past the loop point. */
  readonly time: number;
}

/**
 * Every step in `[from, until)`, in order, with the moment it sounds. Half-open
 * on purpose: a step on a window boundary belongs to the window opening on it,
 * so contiguous windows play it exactly once.
 */
export function stepsInWindow(loop: Loop, from: number, until: number): ScheduledStep[] {
  const duration = stepDuration(loop.tempo);
  const first = Math.ceil((from - loop.origin) / duration);
  const last = Math.ceil((until - loop.origin) / duration) - 1;

  const steps: ScheduledStep[] = [];
  for (let index = first; index <= last; index += 1) {
    steps.push({ step: wrap(index), time: loop.origin + index * duration });
  }
  return steps;
}

/** Where a moment falls, in fractional steps from the origin, unwrapped. */
export function positionAt(loop: Loop, time: number): number {
  return (time - loop.origin) / stepDuration(loop.tempo);
}

/**
 * Which step sounds at a moment — the scheduling arithmetic read backwards. One
 * clock, one formula, so the playhead cannot drift against the kit.
 */
export function stepAt(loop: Loop, time: number): number {
  return wrap(Math.floor(positionAt(loop, time)));
}

/**
 * Same loop, new tempo, same place in the pattern at `at`.
 *
 * A loop is anchored at its first step, so overwriting the tempo would
 * re-measure the elapsed stretch in steps of another length and jerk to an
 * unrelated step. Moving the anchor pivots about `at` instead: what came before
 * keeps its times, what follows runs at the new tempo from there.
 */
export function retune(loop: Loop, tempo: number, at: number): Loop {
  return { tempo, origin: at - positionAt(loop, at) * stepDuration(tempo) };
}

/** Pass-counting index → step of the pattern. */
function wrap(index: number): number {
  return ((index % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
}
