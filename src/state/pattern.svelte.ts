import type { Articulation, InstrumentId, Pattern } from '../core/pattern.js';
import {
  articulationAt,
  toggleStep,
  withArticulation,
  withNothingWritten,
  withTempo,
} from '../core/pattern.js';
import { loadStore, saveCurrent } from '../adapters/storage.js';

/**
 * Reactive edge of the pattern document; runes live here and nowhere else.
 *
 * Replaced, never mutated, hence `$state.raw`: no proxy, rendering reacts to
 * identity. One setter for every replacement, which also autosaves, so a new
 * kind of edit cannot forget to persist.
 */
class PatternState {
  #pattern = $state.raw<Pattern>(loadStore().current);

  get current(): Pattern {
    return this.#pattern;
  }

  /** Flips one cell, returning what it now holds, so the caller can sound
   *  exactly that without asking twice. */
  toggle(instrument: InstrumentId, step: number): Articulation {
    const next = toggleStep(this.#pattern, instrument, step);
    this.#commit(next);
    return articulationAt(next, instrument, step);
  }

  /** Writes one cell outright, returning what it now holds, so the caller can
   *  audition it without asking twice. `empty` sounds as nothing. */
  write(instrument: InstrumentId, step: number, articulation: Articulation): Articulation {
    const next = withArticulation(this.#pattern, instrument, step, articulation);
    this.#commit(next);
    return articulationAt(next, instrument, step);
  }

  /** Puts a whole pattern on the grid, tempo and all — how a kept groove is
   *  loaded. The pattern is an immutable value, so the caller's copy and this
   *  one cannot diverge into each other: editing here never reaches there. */
  replace(pattern: Pattern): void {
    this.#commit(pattern);
  }

  /** Rubs out the groove; tempo and playback untouched — an empty pattern plays
   *  as silence, not as a stop. */
  clear(): void {
    this.#commit(withNothingWritten(this.#pattern));
  }

  /** Tempo via the core's clamp: asked-for and played may differ, so read it
   *  back rather than trusting what was sent. */
  setTempo(tempo: number): void {
    this.#commit(withTempo(this.#pattern, tempo));
  }

  #commit(pattern: Pattern): void {
    this.#pattern = pattern;
    saveCurrent(pattern);
  }
}

export const patternState = new PatternState();
