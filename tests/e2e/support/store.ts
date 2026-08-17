import { serialiseStore } from '../../../src/core/codec.js';
import type { Library } from '../../../src/core/library.js';
import { emptyLibrary } from '../../../src/core/library.js';
import type { Pattern } from '../../../src/core/pattern.js';

/**
 * A serialised store for seeding storage: the pattern the app opens on, plus
 * the library. Written through the codec, so a test never knows the shape.
 */
export function storedApp(current: Pattern, library: Library = emptyLibrary()): string {
  return serialiseStore({ current, library });
}

/**
 * Same store with library entries spliced in that the codec would never write —
 * rot, or an unreadable version. Going round the codec is the point: nothing
 * else can put an unreadable entry in front of the app.
 */
export function withUnreadable(stored: string, entries: Readonly<Record<string, unknown>>): string {
  const store = JSON.parse(stored) as { library: Record<string, unknown> };
  return JSON.stringify({ ...store, library: { ...store.library, ...entries } });
}
