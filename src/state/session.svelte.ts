import type { Pattern } from '../core/pattern.js';
import { patternState } from './pattern.svelte.js';
import { transportState } from './transport.svelte.js';

/**
 * Where the transport and the pattern meet. The scheduler re-reads the pattern
 * every tick, so an edit becomes audible without a break — right for one cell,
 * wrong for a different piece of music. Hence: acts that replace the pattern
 * *wholesale* stop the loop first; in-place edits do not.
 *
 * The rule sits above both states, not inside either — the transport already
 * reads the pattern, and reaching back would close a cycle. Controls call this
 * seam, not `patternState`, so a later replacing act (import, undo) inherits
 * the rule instead of remembering it.
 */
export const session = {
  /** Puts a kept groove on the grid: different music, so the loop stops and the
   *  playhead goes out. */
  load(pattern: Pattern): void {
    transportState.stop();
    patternState.replace(pattern);
  },

  /** Rubs the groove out. Stops for the same reason a load does, and because a
   *  pulse over an empty grid plays nothing. */
  clear(): void {
    transportState.stop();
    patternState.clear();
  },
};
