import type { InstrumentId, Pattern } from '../core/pattern.js';
import { isStepFilled, toggleStep, withTempo } from '../core/pattern.js';
import { loadPattern, savePattern } from '../adapters/storage.js';

/**
 * The reactive edge of the pattern document. Runes live here and nowhere else;
 * components read from this singleton and the core never sees it.
 *
 * The pattern is a value that is only ever replaced, never mutated, so it is
 * held in `$state.raw` — no proxy, and rendering can react to identity. Every
 * replacement funnels through one setter, which is also where the autosave
 * happens, so a new kind of edit cannot forget to persist itself.
 */
class PatternState {
  #pattern = $state.raw<Pattern>(loadPattern());

  get current(): Pattern {
    return this.#pattern;
  }

  /** Flips one cell and reports whether it is now written, so a caller can
   * sound what was just added without asking the pattern a second time. */
  toggle(instrument: InstrumentId, step: number): boolean {
    const next = toggleStep(this.#pattern, instrument, step);
    this.#replace(next);
    return isStepFilled(next, instrument, step);
  }

  /**
   * Moves the tempo, through the core's clamp — so what a caller asks for and
   * what ends up playing may differ, and a caller showing the number back has
   * to read it from here rather than trust what it sent.
   */
  setTempo(tempo: number): void {
    this.#replace(withTempo(this.#pattern, tempo));
  }

  #replace(pattern: Pattern): void {
    this.#pattern = pattern;
    savePattern(pattern);
  }
}

export const patternState = new PatternState();
