import { serialiseStore } from '../../../src/core/codec.js';
import type { Library } from '../../../src/core/library.js';
import { emptyLibrary } from '../../../src/core/library.js';
import type { Pattern } from '../../../src/core/pattern.js';

/**
 * A serialised store, for seeding storage: the pattern the app should open on,
 * and the library beside it. Written through the codec, so a test never has to
 * know the stored shape.
 */
export function storedApp(current: Pattern, library: Library = emptyLibrary()): string {
  return serialiseStore({ current, library });
}

/**
 * The same store with library entries spliced in that the codec would never
 * write — rot, or a version this build does not read. Going round the codec is
 * the point: nothing else can put in front of the app an entry it cannot read.
 */
export function withUnreadable(stored: string, entries: Readonly<Record<string, unknown>>): string {
  const store = JSON.parse(stored) as { library: Record<string, unknown> };
  return JSON.stringify({ ...store, library: { ...store.library, ...entries } });
}
