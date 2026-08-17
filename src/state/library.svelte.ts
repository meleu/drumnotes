import type { Entry, Library } from '../core/library.js';
import { entriesOf, freeName, holds, keep, nameOf, remove } from '../core/library.js';
import type { Pattern } from '../core/pattern.js';
import { loadStore, saveLibrary } from '../adapters/storage.js';
import { patternState } from './pattern.svelte.js';

/**
 * Reactive edge of the library. Runes live here and nowhere else; the core
 * never sees this.
 *
 * Replaced, never mutated, hence `$state.raw`. Every replacement funnels
 * through one setter, which also persists, so a new kind of change cannot
 * forget to write.
 */
class LibraryState {
  #library = $state.raw<Library>(loadStore().library);

  /** The rows, as the panel shows them. */
  get entries(): readonly Entry[] {
    return entriesOf(this.#library);
  }

  /** An unkept `Pattern N` name, for the field to open carrying. */
  get freeName(): string {
    return freeName(this.#library);
  }

  /**
   * The row the grid's pattern is, else null. Derived, not stored, so it
   * answers the moment a cell changes and there's no dirty flag to keep honest.
   *
   * Reaching across to the pattern is what makes it one answer: the row's mark
   * and the question a load asks are the same comparison, so cannot come apart.
   */
  get onGrid(): string | null {
    return nameOf(this.#library, patternState.current);
  }

  /** Whether a name is already kept, case aside — so a save can ask before
   *  overwriting rather than replacing silently. */
  holds(name: string): boolean {
    return holds(this.#library, name);
  }

  /** Keeps a pattern under a name, replacing whatever it held. Immutable value,
   *  so later grid edits cannot reach it. */
  keep(name: string, pattern: Pattern): void {
    this.#replace(keep(this.#library, name, pattern));
  }

  /** Drops what a name held. The grid holds a copy, untouched even if it came
   *  from the dropped row. */
  remove(name: string): void {
    this.#replace(remove(this.#library, name));
  }

  #replace(library: Library): void {
    this.#library = library;
    saveLibrary(library);
  }
}

export const libraryState = new LibraryState();
