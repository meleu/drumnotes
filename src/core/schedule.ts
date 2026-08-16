/**
 * Playback arithmetic: which steps sound between two moments, at a tempo,
 * looping forever. Pure — no audio, timers or lookahead policy. Times are the
 * caller's clock: audio clock in the app, plain numbers in tests.
 */

import type { Articulation, Dynamic, Pattern, Sound } from './pattern.js';
import { MAX_LEADS, STEPS_PER_BEAT, TOTAL_STEPS, hitsAt, hitsOf } from './pattern.js';

const SECONDS_PER_MINUTE = 60;

/** Seconds per sixteenth-note step. */
export function stepDuration(tempo: number): number {
  return SECONDS_PER_MINUTE / tempo / STEPS_PER_BEAT;
}

/** Seconds per pass through the whole pattern. */
export function loopDuration(tempo: number): number {
  return TOTAL_STEPS * stepDuration(tempo);
}

/**
 * Grace lead wherever a step can hold it. Tight enough that a flam is one
 * gesture, leaving a drag's two leads audibly wider without sounding late.
 */
const GRACE_LEAD_SECONDS = 0.02;
/** Keeps a drag's two leads inside the preceding sixteenth. */
const GRACE_LEAD_SHARE_OF_STEP = 1 / 3;

/**
 * How far ahead of its step a grace hit sounds. Real time, not a subdivision — a
 * proportional lead would read as a written 32nd at 40 BPM and vanish at 240 —
 * tightened only where the fixed lead would crowd the step before (ADR 0006).
 */
export function graceLead(tempo: number): number {
  return Math.min(GRACE_LEAD_SECONDS, stepDuration(tempo) * GRACE_LEAD_SHARE_OF_STEP);
}

/**
 * Furthest ahead of its step anything sounds. A tick's horizon runs forward by
 * this, so a sound just past the window is never reached for after it was due.
 */
export function longestLead(tempo: number): number {
  return MAX_LEADS * graceLead(tempo);
}

export interface Loop {
  readonly tempo: number;
  /** When step 0 of the first pass sounds. */
  readonly origin: number;
}

export interface ScheduledStep {
  /** Lane index, wrapped however many passes deep. */
  readonly step: number;
  /** Absolute time, still climbing past the loop point. */
  readonly time: number;
}

/**
 * Every step in `[from, until)`, in order, with when it sounds. Half-open on
 * purpose: a boundary step belongs to the window opening on it, so contiguous
 * windows play it exactly once.
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

/** A sound with its due moment — what the hardware is handed. */
export interface ScheduledSound extends Sound {
  /** Absolute time; a grace hit sits before the step it leads into. Climbs
   *  past the loop point, like a step's own time. */
  readonly time: number;
}

/**
 * Every sound of every step in `[from, until)`, earliest first.
 *
 * Windowed by step time: a step belongs to the window its moment falls in, grace
 * hits go with it however early. That keeps windows tiling — each sound handed
 * over once, a tempo change at a seam neither dropping nor doubling a step. The
 * price: a window reaches back up to `longestLead` before its own opening edge,
 * which is what the caller's horizon runs forward by (ADR 0006).
 */
export function soundsInWindow(
  loop: Loop,
  pattern: Pattern,
  from: number,
  until: number,
): ScheduledSound[] {
  const lead = graceLead(loop.tempo);

  return stepsInWindow(loop, from, until)
    .flatMap(({ step, time }) =>
      hitsAt(pattern, step).map(({ instrument, dynamic, leads }) => ({
        instrument,
        dynamic,
        time: time - leads * lead,
      })),
    )
    .sort((a, b) => a.time - b.time);
}

/** One audition hit: its rung, and how long after the tap. */
export interface AuditionedHit {
  readonly dynamic: Dynamic;
  /** Seconds after the audition begins; first hit is always 0. */
  readonly delay: number;
}

/**
 * How an articulation sounds when its cell is written. The ornament is heard
 * whole, but with no step to anchor to it starts at the tap and the main hit
 * follows a lead later — playback is the reverse, the grace reaching back.
 */
export function auditionOf(articulation: Articulation, tempo: number): readonly AuditionedHit[] {
  const hits = hitsOf(articulation);
  const first = hits[0]?.leads ?? 0;
  const lead = graceLead(tempo);

  return hits.map(({ leads, dynamic }) => ({ dynamic, delay: (first - leads) * lead }));
}

/** Fractional steps from the origin, unwrapped. */
export function positionAt(loop: Loop, time: number): number {
  return (time - loop.origin) / stepDuration(loop.tempo);
}

/** Which step sounds at a moment: scheduling read backwards. One clock, one
 *  formula, so the playhead cannot drift against the kit. */
export function stepAt(loop: Loop, time: number): number {
  return wrap(Math.floor(positionAt(loop, time)));
}

/**
 * Same loop, new tempo, same place at `at`. Since a loop is anchored at its
 * first step, just overwriting the tempo would re-measure elapsed time in
 * different-length steps and jerk elsewhere. Moving the anchor pivots about
 * `at`: earlier times stand, later ones run at the new tempo.
 */
export function retune(loop: Loop, tempo: number, at: number): Loop {
  return { tempo, origin: at - positionAt(loop, at) * stepDuration(tempo) };
}

/** Pass-counting index → pattern step. */
function wrap(index: number): number {
  return ((index % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
}
