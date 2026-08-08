import type { InstrumentId, Pattern } from '../core/pattern.js';
import { emptyPattern, toggleStep } from '../core/pattern.js';

/**
 * The reactive edge of the pattern document. Runes live here and nowhere else;
 * components read from this singleton and the core never sees it.
 *
 * The pattern is a value that is only ever replaced, never mutated, so it is
 * held in `$state.raw` — no proxy, and rendering can react to identity.
 */
class PatternState {
  #pattern = $state.raw<Pattern>(emptyPattern());

  get current(): Pattern {
    return this.#pattern;
  }

  toggle(instrument: InstrumentId, step: number): void {
    this.#pattern = toggleStep(this.#pattern, instrument, step);
  }
}

export const patternState = new PatternState();
