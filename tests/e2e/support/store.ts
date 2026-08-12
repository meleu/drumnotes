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
