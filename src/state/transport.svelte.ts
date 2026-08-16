import { DEFAULT_TEMPO } from '../core/pattern.js';
import type { Loop } from '../core/schedule.js';
import { longestLead, retune, soundsInWindow, stepAt } from '../core/schedule.js';
import { audioState } from './audio.svelte.js';
import { patternState } from './pattern.svelte.js';

/**
 * Playback: a coarse timer hands the hardware every hit in a short stretch of
 * the near future; the hardware decides exactly when each sounds. The timer's
 * accuracy never reaches the ear — it only has to stay ahead.
 */

const LOOKAHEAD_SECONDS = 0.1;
/** Well under the lookahead, so a late tick still lands before the queue empties. */
const TICK_MS = 25;
/** Slack between Play and the pass's first sound (a grace hit, if the downbeat
 *  is ornamented), so it is handed over as a moment still to come. Real time,
 *  not musical: a fraction of even the fastest beat, inaudible. */
const START_SLACK_SECONDS = 0.06;

class TransportState {
  #playing = $state(false);
  #step = $state(0);
  #timer: ReturnType<typeof setInterval> | undefined;
  #frame: number | undefined;
  /** Tempo playing, and the audio-clock time step 0 sounded at. */
  #loop: Loop = { tempo: DEFAULT_TEMPO, origin: 0 };
  /** Handed over through this time. Each tick opens where the last closed, so
   *  windows tile: nothing scheduled twice, nothing missed. */
  #scheduledThrough = 0;

  get playing(): boolean {
    return this.#playing;
  }

  /** Step sounding now, `null` when stopped — clears every highlight at once. */
  get playhead(): number | null {
    return this.#playing ? this.#step : null;
  }

  /** Starts from the top; no-op while playing. */
  start(): void {
    if (this.#playing) return;

    audioState.wake();
    const { tempo } = patternState.current;
    // Step 0 sits a longest lead further out, so the slack measures the gap to
    // the first sound, grace hit or not (ADR 0006).
    const origin = audioState.now + START_SLACK_SECONDS + longestLead(tempo);
    this.#loop = { tempo, origin };
    this.#scheduledThrough = origin;
    this.#playing = true;

    this.#schedule();
    this.#timer = setInterval(() => this.#schedule(), TICK_MS);
    this.#follow();
  }

  /** Halts and rewinds; only starting sets an origin. */
  stop(): void {
    if (!this.#playing) return;

    clearInterval(this.#timer);
    this.#timer = undefined;
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
    audioState.cancelPending();
    this.#playing = false;
    this.#step = 0;
  }

  /**
   * Pattern and tempo re-read each tick: an edit becomes audible on the next
   * tick, without retracting a hit already handed over. A tempo change pivots
   * about the last window's edge, so the groove carries on instead of jumping.
   */
  #schedule(): void {
    const pattern = patternState.current;
    if (pattern.tempo !== this.#loop.tempo) {
      this.#loop = retune(this.#loop, pattern.tempo, this.#scheduledThrough);
    }

    // Horizon runs a longest lead past the lookahead, bookkeeping stays in step
    // time: grace hits go over with the step that owns them, so nothing is
    // reached for late and windows still tile across a tempo change.
    const until = audioState.now + LOOKAHEAD_SECONDS + longestLead(this.#loop.tempo);
    if (until <= this.#scheduledThrough) return;

    for (const sound of soundsInWindow(this.#loop, pattern, this.#scheduledThrough, until)) {
      audioState.schedule(sound.instrument, sound.dynamic, sound.time);
    }
    this.#scheduledThrough = until;
  }

  /**
   * The playhead. Each frame asks the audio clock the hits were handed to, and
   * converts with the arithmetic that placed them. A wall clock or frame count
   * would answer the eye's question, not the ear's, and the two would drift.
   */
  #follow(): void {
    this.#frame = requestAnimationFrame(() => {
      // Play precedes the origin; clamp so that slack reads as step 0, not the
      // tail of a pass that never happened.
      const step = stepAt(this.#loop, Math.max(audioState.now, this.#loop.origin));
      // A step lasts many frames: write only on change.
      if (step !== this.#step) this.#step = step;
      this.#follow();
    });
  }
}

export const transportState = new TransportState();
