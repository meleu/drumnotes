/**
 * The only place that knows where the store lives. Shape checking is the
 * codec's; this just moves a string in and out and swallows storage errors — a
 * blocked or full store means unsaved, never broken.
 *
 * The last-written store is held in memory and each write is merged into it, so
 * the autosave that fires on every cell tap and a library write cannot clobber
 * one another, and neither re-reads the store to find out what the other did.
 */

import type { Store } from '../core/codec.js';
import { parseStore, serialiseStore } from '../core/codec.js';
import type { Library } from '../core/library.js';
import type { Pattern } from '../core/pattern.js';

/** Everything kept: the pattern on the grid and the library beside it. */
export const STORAGE_KEY = 'drumnotes:store';

/** Where the single autosaved pattern lived before the library. Deleted once at
 *  startup and never read: there were no users, so there is nothing to
 *  migrate. */
const ABANDONED_KEY = 'drumnotes:pattern';

let held: Store = start();

function start(): Store {
  forget(ABANDONED_KEY);
  return parseStore(read());
}

/** What was there when the app opened — read once, then kept in memory. */
export function loadStore(): Store {
  return held;
}

export function saveCurrent(current: Pattern): void {
  write({ ...held, current });
}

export function saveLibrary(library: Library): void {
  write({ ...held, library });
}

function write(store: Store): void {
  held = store;
  try {
    localStorage.setItem(STORAGE_KEY, serialiseStore(store));
  } catch {
    // Storage blocked or full: keep playing, just unsaved.
  }
}

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function forget(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do about a store that will not even let go of a key.
  }
}
