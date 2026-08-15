import type { Pattern } from '../core/pattern.js';
import { patternState } from './pattern.svelte.js';
import { transportState } from './transport.svelte.js';

/**
 * Where the transport and the pattern meet. The scheduler re-reads the pattern
 * every tick so an edit becomes audible without a break — right for one cell,
 * wrong for a different piece of music. So every act that replaces the pattern
 * *wholesale* stops the loop first, and every act that edits it in place does
 * not.
 *
 * The rule lives above both states rather than inside either: the transport
 * already reads the pattern, and the pattern reaching back would close a cycle.
 * Controls call this seam instead of `patternState` directly, so a later
 * replacing act — an import, an undo — inherits the rule rather than having to
 * remember it.
 */
export const session = {
  /** Puts a kept groove on the grid: a different piece of music, so the loop
   *  stops and the playhead goes out. */
  load(pattern: Pattern): void {
    transportState.stop();
    patternState.replace(pattern);
  },

  /** Rubs the groove out. Stops for the same reason a load does, and because a
   *  pulse over an empty grid is a loop playing nothing. */
  clear(): void {
    transportState.stop();
    patternState.clear();
  },
};
