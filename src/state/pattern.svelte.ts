import type { Articulation, InstrumentId, Pattern } from '../core/pattern.js';
import {
  isWritten,
  toggleStep,
  withArticulation,
  withNothingWritten,
  withTempo,
} from '../core/pattern.js';
import { loadPattern, savePattern } from '../adapters/storage.js';

/**
 * Reactive edge of the pattern document. Runes live here and nowhere else; the
 * core never sees this.
 *
 * The pattern is replaced, never mutated, so `$state.raw`: no proxy, and
 * rendering reacts to identity. Every replacement funnels through one setter,
 * which also autosaves, so a new kind of edit cannot forget to persist.
 */
class PatternState {
  #pattern = $state.raw<Pattern>(loadPattern());

  get current(): Pattern {
    return this.#pattern;
  }

  /** Flips one cell; reports whether it is now written, so a caller can sound
   *  what was added without asking twice. */
  toggle(instrument: InstrumentId, step: number): boolean {
    const next = toggleStep(this.#pattern, instrument, step);
    this.#replace(next);
    return isWritten(next, instrument, step);
  }

  /** Writes one cell outright, whatever it held; reports whether it now sounds,
   *  so a caller can audition what it wrote without asking twice. */
  write(instrument: InstrumentId, step: number, articulation: Articulation): boolean {
    const next = withArticulation(this.#pattern, instrument, step, articulation);
    this.#replace(next);
    return isWritten(next, instrument, step);
  }

  /** Rubs out the whole groove, tempo and playback untouched — an empty pattern
   *  plays as silence rather than as a stop. */
  clear(): void {
    this.#replace(withNothingWritten(this.#pattern));
  }

  /** Sets the tempo through the core's clamp, so what is asked for and what
   *  plays may differ: read the number back rather than trusting what was sent. */
  setTempo(tempo: number): void {
    this.#replace(withTempo(this.#pattern, tempo));
  }

  #replace(pattern: Pattern): void {
    this.#pattern = pattern;
    savePattern(pattern);
  }
}

export const patternState = new PatternState();
