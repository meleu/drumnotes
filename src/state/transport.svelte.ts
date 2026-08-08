import { instrumentsAt } from '../core/pattern.js';
import { stepsInWindow } from '../core/schedule.js';
import { audioState } from './audio.svelte.js';
import { patternState } from './pattern.svelte.js';

/**
 * Playback: a coarse timer that hands the audio hardware every hit falling in a
 * short stretch of the near future, and lets the hardware decide exactly when
 * each one sounds. The timer's own accuracy therefore never reaches the ear —
 * it only has to wake often enough to stay ahead.
 */

/** How far ahead each pass hands work over. */
const LOOKAHEAD_SECONDS = 0.1;
/** How often the timer wakes. Comfortably shorter than the lookahead, so a
 * late wake-up still lands before the work it queued has run out. */
const TICK_MS = 25;
/**
 * A beat of slack between pressing Play and the first hit, so step 0 is handed
 * over as a future moment rather than one that has just gone by.
 */
const LEAD_IN_SECONDS = 0.06;

class TransportState {
  #playing = $state(false);
  #timer: ReturnType<typeof setInterval> | undefined;
  /** Audio-clock time of step 0 of the first pass. */
  #origin = 0;
  /**
   * The time through which hits have already been handed over. Each pass opens
   * its window exactly where the last one closed, so consecutive windows tile
   * the timeline: nothing is scheduled twice and nothing falls between them.
   */
  #scheduledThrough = 0;

  get playing(): boolean {
    return this.#playing;
  }

  /** Starts the loop from the top. Pressing it while playing does nothing. */
  start(): void {
    if (this.#playing) return;

    audioState.wake();
    this.#origin = audioState.now + LEAD_IN_SECONDS;
    this.#scheduledThrough = this.#origin;
    this.#playing = true;

    this.#schedule();
    this.#timer = setInterval(() => this.#schedule(), TICK_MS);
  }

  /**
   * Halts and rewinds to the first step — the next Play starts from there,
   * because starting is the only thing that sets an origin.
   */
  stop(): void {
    if (!this.#playing) return;

    clearInterval(this.#timer);
    this.#timer = undefined;
    audioState.cancelPending();
    this.#playing = false;
  }

  /**
   * The pattern and tempo are read afresh every pass, which is exactly how an
   * edit becomes audible: within one window, on the next pass, without ever
   * retracting a hit already handed over.
   */
  #schedule(): void {
    const pattern = patternState.current;
    const until = audioState.now + LOOKAHEAD_SECONDS;
    if (until <= this.#scheduledThrough) return;

    const loop = { tempo: pattern.tempo, origin: this.#origin };
    for (const { step, time } of stepsInWindow(loop, this.#scheduledThrough, until)) {
      for (const instrument of instrumentsAt(pattern, step)) {
        audioState.schedule(instrument, time);
      }
    }
    this.#scheduledThrough = until;
  }
}

export const transportState = new TransportState();
