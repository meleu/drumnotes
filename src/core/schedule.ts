/**
 * Playback arithmetic: which steps sound between two moments, at a tempo,
 * looping forever. Pure — no audio, no timers, no lookahead policy.
 *
 * Times are whatever clock the caller keeps: the audio clock in the app, plain
 * numbers in a test.
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

/** The lead a grace hit keeps wherever a step is long enough to hold it. */
const GRACE_LEAD_SECONDS = 0.03;
/** So a drag's two leads cannot reach back past the sixteenth before. */
const GRACE_LEAD_SHARE_OF_STEP = 1 / 3;

/**
 * How far ahead of its step a grace hit sounds. Real time rather than a
 * subdivision — a flam is a gesture of the hand, and a proportional lead would
 * read as a written 32nd at 40 BPM and vanish at 240 — tightened only where a
 * step is short enough that the fixed lead would crowd the step before
 * (ADR 0006).
 */
export function graceLead(tempo: number): number {
  return Math.min(GRACE_LEAD_SECONDS, stepDuration(tempo) * GRACE_LEAD_SHARE_OF_STEP);
}

/**
 * The furthest ahead of its own step anything in the vocabulary sounds — a
 * drag's first grace hit. What a tick's horizon runs forward by, so a sound
 * belonging to a step just past the window is never reached for after the
 * moment it was due.
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

/** A sound with the moment it is due — what the hardware is handed. */
export interface ScheduledSound extends Sound {
  /** Absolute time, an ornament's grace hit sitting before the step it leads
   *  into. Still climbing past the loop point, as a step's own time does. */
  readonly time: number;
}

/**
 * Every sound of every step in `[from, until)`, each at its own moment, earliest
 * first.
 *
 * The window is measured in step time: a step belongs to the window its own
 * moment falls in, and its grace hits go with it however far ahead of it they
 * sound. That is what keeps windows tiling — a sound is handed over exactly
 * once, and a tempo change at a seam neither drops nor doubles a step, though
 * the lead moves with the tempo. The price is that a window reaches back before
 * its own opening edge by up to `longestLead`, which is what the caller's
 * horizon runs forward by (ADR 0006).
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

/** One hit of an audition: the rung it sounds at, and how long after the tap. */
export interface AuditionedHit {
  readonly dynamic: Dynamic;
  /** Seconds after the audition begins; the first hit is always at once. */
  readonly delay: number;
}

/**
 * How an articulation sounds when the cell holding it is written.
 *
 * The ornament is heard whole — a flam auditions as a flam — but an audition
 * has no step coming to sound before, so it starts where the tap did and the
 * hit the grace leads into follows a lead later. Playback is the other way
 * round: there the step is fixed and the grace hit reaches back for it.
 */
export function auditionOf(articulation: Articulation, tempo: number): readonly AuditionedHit[] {
  const hits = hitsOf(articulation);
  const first = hits[0]?.leads ?? 0;
  const lead = graceLead(tempo);

  return hits.map(({ leads, dynamic }) => ({ dynamic, delay: (first - leads) * lead }));
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
