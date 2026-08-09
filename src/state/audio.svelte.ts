import { createDrumKit } from '../adapters/audio.js';
import type { InstrumentId } from '../core/pattern.js';

/**
 * Reactive edge of the drum kit; nothing else touches an `AudioContext`.
 *
 * The context is built on load (suspended, as browsers insist) and woken on the
 * first press, which is a user gesture by definition. Decoding starts at once,
 * so samples are ready before the first tap rather than because of it.
 */
class AudioState {
  #kit = createDrumKit(new AudioContext({ latencyHint: 'interactive' }));
  #ready = $state(false);

  constructor() {
    void this.#kit.ready.then(() => {
      this.#ready = true;
    });
  }

  /** Controls that make sound wait on this. */
  get ready(): boolean {
    return this.#ready;
  }

  /** The one clock playback is allowed to believe. */
  get now(): number {
    return this.#kit.now;
  }

  /** Sounds an instrument as it is written down. Waking is deliberately not
   *  awaited: that round trip would sit between tap and hit, and a hit started
   *  on a context about to run sounds as soon as it does. */
  audition(instrument: InstrumentId): void {
    this.wake();
    this.#kit.play(instrument);
  }

  /** Hands a hit to the hardware for a moment yet to come. */
  schedule(instrument: InstrumentId, when: number): void {
    this.#kit.play(instrument, when);
  }

  /** Drops what has been scheduled and not yet sounded. */
  cancelPending(): void {
    this.#kit.cancelPending();
  }

  /** Call from a user gesture; harmless afterwards. */
  wake(): void {
    void this.#kit.resume();
  }
}

export const audioState = new AudioState();
