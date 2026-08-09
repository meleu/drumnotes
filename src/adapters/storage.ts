/**
 * The only place that knows where the autosaved pattern lives. Shape checking is
 * the codec's; this just moves a string in and out and swallows storage errors —
 * a blocked or full store means unsaved, never broken.
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
