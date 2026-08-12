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
    this.#replace(next);
    return articulationAt(next, instrument, step);
  }

  /** Writes one cell outright, returning what it now holds, so the caller can
   *  audition it without asking twice. `empty` sounds as nothing. */
  write(instrument: InstrumentId, step: number, articulation: Articulation): Articulation {
    const next = withArticulation(this.#pattern, instrument, step, articulation);
    this.#replace(next);
    return articulationAt(next, instrument, step);
  }

  /** Rubs out the groove; tempo and playback untouched — an empty pattern plays
   *  as silence, not as a stop. */
  clear(): void {
    this.#replace(withNothingWritten(this.#pattern));
  }

  /** Tempo via the core's clamp: asked-for and played may differ, so read it
   *  back rather than trusting what was sent. */
  setTempo(tempo: number): void {
    this.#replace(withTempo(this.#pattern, tempo));
  }

  #replace(pattern: Pattern): void {
    this.#pattern = pattern;
    saveCurrent(pattern);
  }
}

export const patternState = new PatternState();
