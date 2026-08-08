/**
 * The arithmetic behind playback: which steps sound between two moments, at a
 * given tempo, looping forever. Pure — it knows nothing of audio, of timers or
 * of how far ahead the caller likes to work.
 *
 * Times here are whatever clock the caller keeps; the app hands it the audio
 * clock, and a test hands it plain numbers.
 */

import { STEPS_PER_BEAT, TOTAL_STEPS } from './pattern.js';

const SECONDS_PER_MINUTE = 60;

/** How long one sixteenth-note step lasts, in seconds. */
export function stepDuration(tempo: number): number {
  return SECONDS_PER_MINUTE / tempo / STEPS_PER_BEAT;
}

/** How long one pass through the whole pattern lasts, in seconds. */
export function loopDuration(tempo: number): number {
  return TOTAL_STEPS * stepDuration(tempo);
}

export interface Loop {
  readonly tempo: number;
  /** The time at which step 0 of the first pass sounds. */
  readonly origin: number;
}

export interface ScheduledStep {
  /** Index into a lane, always within the pattern however many passes deep. */
  readonly step: number;
  /** When it sounds — an absolute time, still counting up past the loop point. */
  readonly time: number;
}

/**
 * Every step falling in `[from, until)`, in order, each with the moment it
 * sounds. The window is half-open on purpose: a step landing exactly on the
 * boundary between two windows belongs to the one that opens on it, so a caller
 * walking contiguous windows plays it exactly once and never skips it.
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

/**
 * Where a moment falls in the pattern, counted in steps from the origin and
 * still climbing past the loop point — fractional between two steps.
 */
export function positionAt(loop: Loop, time: number): number {
  return (time - loop.origin) / stepDuration(loop.tempo);
}

/**
 * The same loop at a new tempo, still standing in the same place at `at`.
 *
 * A loop is anchored by the moment its first step sounded, so simply writing a
 * new tempo over the old one would re-measure that whole elapsed stretch in
 * steps of a different length and jerk the pattern to some unrelated step.
 * Moving the anchor instead pivots the loop about `at`: everything before it
 * keeps the times it was already given, and everything after it runs at the new
 * tempo from exactly where the old one left off.
 */
export function retune(loop: Loop, tempo: number, at: number): Loop {
  return { tempo, origin: at - positionAt(loop, at) * stepDuration(tempo) };
}

/** Which step of the pattern a pass-counting index lands on. */
function wrap(index: number): number {
  return ((index % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
}
