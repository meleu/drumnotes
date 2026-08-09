import { DEFAULT_TEMPO, instrumentsAt } from '../core/pattern.js';
import type { Loop } from '../core/schedule.js';
import { retune, stepAt, stepsInWindow } from '../core/schedule.js';
import { audioState } from './audio.svelte.js';
import { patternState } from './pattern.svelte.js';

/**
 * Playback: a coarse timer that hands the audio hardware every hit falling in a
 * short stretch of the near future, and lets the hardware decide exactly when
 * each one sounds. The timer's own accuracy therefore never reaches the ear —
 * it only has to tick often enough to stay ahead.
 */

/** How far ahead each tick hands work over. */
const LOOKAHEAD_SECONDS = 0.1;
/** How often the timer ticks. Comfortably shorter than the lookahead, so a
 * late tick still lands before the work it queued has run out. */
const TICK_MS = 25;
/**
 * The slack between pressing Play and the first sound, so step 0 is handed over
 * as a moment still to come rather than one that has just gone by. Real time
 * rather than musical: it does not scale with tempo, and it is a fraction of
 * even the fastest beat. Not a count-in — nobody hears this.
 */
const START_SLACK_SECONDS = 0.06;

class TransportState {
  #playing = $state(false);
  #step = $state(0);
  #timer: ReturnType<typeof setInterval> | undefined;
  #frame: number | undefined;
  /** The tempo being played and the audio-clock time step 0 sounded at. */
  #loop: Loop = { tempo: DEFAULT_TEMPO, origin: 0 };
  /**
   * The time through which hits have already been handed over. Each tick opens
   * its window exactly where the last one closed, so consecutive windows tile
   * the timeline: nothing is scheduled twice and nothing falls between them.
   */
  #scheduledThrough = 0;

  get playing(): boolean {
    return this.#playing;
  }

  /**
   * The step sounding right now, or `null` when stopped — there is no playhead
   * to show then, which is what clears every highlight at once.
   */
  get playhead(): number | null {
    return this.#playing ? this.#step : null;
  }

  /** Starts the loop from the top. Pressing it while playing does nothing. */
  start(): void {
    if (this.#playing) return;

    audioState.wake();
    const origin = audioState.now + START_SLACK_SECONDS;
    this.#loop = { tempo: patternState.current.tempo, origin };
    this.#scheduledThrough = origin;
    this.#playing = true;

    this.#schedule();
    this.#timer = setInterval(() => this.#schedule(), TICK_MS);
    this.#follow();
  }

  /**
   * Halts and rewinds to the first step — the next Play starts from there,
   * because starting is the only thing that sets an origin.
   */
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
   * The pattern and tempo are read afresh every tick, which is exactly how an
   * edit becomes audible: within one window, on the next tick, without ever
   * retracting a hit already handed over. A tempo change pivots the loop about
   * the edge of the last window handed over, so the groove carries on from
   * where it had got to instead of jumping.
   */
  #schedule(): void {
    const pattern = patternState.current;
    const until = audioState.now + LOOKAHEAD_SECONDS;
    if (until <= this.#scheduledThrough) return;

    if (pattern.tempo !== this.#loop.tempo) {
      this.#loop = retune(this.#loop, pattern.tempo, this.#scheduledThrough);
    }
    for (const { step, time } of stepsInWindow(this.#loop, this.#scheduledThrough, until)) {
      for (const instrument of instrumentsAt(pattern, step)) {
        audioState.schedule(instrument, time);
      }
    }
    this.#scheduledThrough = until;
  }

  /**
   * The playhead. Each frame asks the audio clock — the very clock the hits
   * were handed to — where the loop has got to, and converts it with the same
   * arithmetic that placed them. A wall clock or a count of frames would answer
   * the question the eye asked rather than the one the ear did, and the two
   * would slowly part company; this cannot.
   */
  #follow(): void {
    this.#frame = requestAnimationFrame(() => {
      /* Play is pressed a moment before the loop's origin, so that slack
       * reads as standing on step 0 rather than as the tail of a pass that
       * never happened. */
      const step = stepAt(this.#loop, Math.max(audioState.now, this.#loop.origin));
      // A step lasts many frames, so most frames have nothing to report; the
      // state is written only when the answer actually changes.
      if (step !== this.#step) this.#step = step;
      this.#follow();
    });
  }
}

export const transportState = new TransportState();
