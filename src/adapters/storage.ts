/**
 * The local-storage adapter: the only place that knows where the autosaved
 * pattern lives. All of the shape checking happens in the pure codec; this
 * layer only moves a string in and out of the browser, and swallows the errors
 * storage itself can raise — a blocked or full store means the groove is not
 * saved, never that the app stops working.
 */

import type { Pattern } from '../core/pattern.js';
import { parsePattern, serialisePattern } from '../core/codec.js';

/** The single autosaved pattern. */
export const STORAGE_KEY = 'drumnotes:pattern';

export function loadPattern(): Pattern {
  return parsePattern(read());
}

export function savePattern(pattern: Pattern): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialisePattern(pattern));
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
