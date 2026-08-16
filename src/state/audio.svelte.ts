import { createDrumKit } from '../adapters/audio.js';
import type { Dynamic, InstrumentId } from '../core/pattern.js';

/**
 * Reactive edge of the drum kit; nothing else touches an `AudioContext`. Built
 * on load (suspended, as browsers insist), woken on the first press. Decoding
 * starts at once, so samples are ready before the first tap, not because of it.
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

  /** The one clock playback may believe. */
  get now(): number {
    return this.#kit.now;
  }

  /**
   * Sounds an instrument as written, at once or a sliver later — which is how an
   * ornament auditions as itself, not as a stack of hits at one moment. A hit
   * due now is handed over with no time, going straight to the hardware.
   *
   * Waking is not awaited: that round trip would sit between tap and hit, and a
   * hit started on a context about to run sounds as soon as it does.
   */
  audition(instrument: InstrumentId, dynamic: Dynamic, delay = 0): void {
    this.wake();
    this.#kit.play(instrument, dynamic, delay > 0 ? this.#kit.now + delay : undefined);
  }

  schedule(instrument: InstrumentId, dynamic: Dynamic, when: number): void {
    this.#kit.play(instrument, dynamic, when);
  }

  cancelPending(): void {
    this.#kit.cancelPending();
  }

  /** Call from a user gesture; harmless afterwards. */
  wake(): void {
    void this.#kit.resume();
  }
}

export const audioState = new AudioState();
