/**
 * Only place that knows where the store lives. Shape checking is the codec's;
 * this moves a string in and out and swallows storage errors — blocked or full
 * means unsaved, never broken.
 *
 * Last-written store held in memory, every write merged into it, so per-cell
 * autosave and library writes cannot clobber each other and neither re-reads.
 *
 * Usability settled once at startup, so the interface can say up front what it
 * cannot offer.
 */

import type { Store } from '../core/codec.js';
import { parseStore, serialiseStore } from '../core/codec.js';
import type { Library } from '../core/library.js';
import type { Pattern } from '../core/pattern.js';

/** Everything kept: grid pattern plus library. */
export const STORAGE_KEY = 'drumnotes:store';

/** Pre-library autosave key. Deleted at startup, never read: no users existed,
 *  so nothing to migrate. */
const ABANDONED_KEY = 'drumnotes:pattern';

/** Written and taken straight back out, only to find out whether it can be. */
const PROBE_KEY = 'drumnotes:probe';

const usable = probe();

let held: Store = start();

/**
 * Whether this browser keeps anything at all. Asked once at startup: a refusing
 * store — private browsing, site-data setting, full quota — does not relent
 * mid-session, so per-write asking would only cost time and could flip for no
 * visible reason.
 *
 * Decides whether the library's controls exist, not whether they are enabled,
 * as `canCopyImage` does for the clipboard.
 */
export function canKeep(): boolean {
  return usable;
}

/* Round trip, not a look: a readable store can still refuse a write, and the
   write is what's promised. */
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

/** What was there at app open — read once, then kept in memory. */
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
    // Nothing to do about a store that won't let go of a key.
  }
}
