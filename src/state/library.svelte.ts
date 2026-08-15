import type { Entry, Library } from '../core/library.js';
import { entriesOf, freeName, keep, remove } from '../core/library.js';
import type { Pattern } from '../core/pattern.js';
import { loadStore, saveLibrary } from '../adapters/storage.js';

/**
 * Reactive edge of the library. Runes live here and nowhere else; the core
 * never sees this.
 *
 * The library is replaced, never mutated, so `$state.raw`. Every replacement
 * funnels through one setter, which also persists, so a new kind of change
 * cannot forget to write.
 */
class LibraryState {
  #library = $state.raw<Library>(loadStore().library);

  /** The rows, as the panel shows them. */
  get entries(): readonly Entry[] {
    return entriesOf(this.#library);
  }

  /** A name in the `Pattern N` series that nothing is kept under, for the field
   *  to open carrying. */
  get freeName(): string {
    return freeName(this.#library);
  }

  /** Keeps a copy of a pattern under a name, replacing whatever that name held.
   *  The value is immutable, so editing the grid afterwards cannot reach it. */
  keep(name: string, pattern: Pattern): void {
    this.#replace(keep(this.#library, name, pattern));
  }

  /** Drops what a name held. The pattern on the grid is a copy and is not
   *  touched, whether or not it came from the row being dropped. */
  remove(name: string): void {
    this.#replace(remove(this.#library, name));
  }

  #replace(library: Library): void {
    this.#library = library;
    saveLibrary(library);
  }
}

export const libraryState = new LibraryState();
