import type { InstrumentId, Pattern } from '../core/pattern.js';
import { toggleStep } from '../core/pattern.js';
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

  toggle(instrument: InstrumentId, step: number): void {
    this.#replace(toggleStep(this.#pattern, instrument, step));
  }

  #replace(pattern: Pattern): void {
    this.#pattern = pattern;
    savePattern(pattern);
  }
}

export const patternState = new PatternState();
