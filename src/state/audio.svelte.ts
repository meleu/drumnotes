import { createDrumKit } from '../adapters/audio.js';
import type { InstrumentId } from '../core/pattern.js';

/**
 * The reactive edge of the drum kit. Components ask it whether the kit can be
 * played and tell it what was just struck; nothing else in the app touches an
 * `AudioContext`.
 *
 * The context is built on load — suspended, as every browser insists — and
 * woken on the first press, which is a user gesture by definition. Decoding
 * starts immediately so the samples are ready before the first tap rather than
 * because of it.
 */
class AudioState {
  #kit = createDrumKit(new AudioContext({ latencyHint: 'interactive' }));
  #ready = $state(false);

  constructor() {
    void this.#kit.ready.then(() => {
      this.#ready = true;
    });
  }

  /** Whether every sample has decoded. Controls that make sound wait on this. */
  get ready(): boolean {
    return this.#ready;
  }

  /**
   * Sounds an instrument the moment it is written down. Waking the context is
   * deliberately not awaited: awaiting it would put a round trip between the
   * tap and the hit, and a hit started on a context that is about to run sounds
   * as soon as it does.
   */
  audition(instrument: InstrumentId): void {
    void this.#kit.resume();
    this.#kit.play(instrument);
  }
}

export const audioState = new AudioState();
