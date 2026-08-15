/**
 * The only place that knows where the store lives. Shape checking is the
 * codec's; this just moves a string in and out and swallows storage errors — a
 * blocked or full store means unsaved, never broken.
 *
 * The last-written store is held in memory and each write is merged into it, so
 * the autosave that fires on every cell tap and a library write cannot clobber
 * one another, and neither re-reads the store to find out what the other did.
 *
 * Whether the store works at all is settled once, at startup, so the interface
 * can say up front what it cannot offer instead of finding out a write at a
 * time.
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

/** Written and taken straight back out, only to find out whether it can be. */
const PROBE_KEY = 'drumnotes:probe';

const usable = probe();

let held: Store = start();

/**
 * Whether this browser will keep anything at all. Asked once, at startup: a
 * store that refuses — private browsing, a site-data setting, a full quota —
 * does not relent mid-session, so asking again per write would only cost time
 * and could answer differently for no reason the drummer could see.
 *
 * Decides whether the library's controls exist rather than whether they are
 * enabled, as `canCopyImage` already does for the clipboard.
 */
export function canKeep(): boolean {
  return usable;
}

/* A round trip rather than a look: a store can be readable and still refuse a
   write, and a write is the thing being promised. */
function probe(): boolean {
  try {
    localStorage.setItem(PROBE_KEY, '');
    localStorage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

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
