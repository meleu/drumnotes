/**
 * The library: patterns kept by name. A pure immutable value, like the patterns
 * it holds — no storage, no runes, no DOM.
 *
 * The name is the identity. There are no generated ids and no renaming, so
 * saving under a name already kept replaces what was there.
 */

import type { Pattern } from './pattern.js';

/** Name to pattern. The name is stored exactly as it was typed. */
export type Library = Readonly<Record<string, Pattern>>;

/** One row of the library: the name, and the pattern kept under it. */
export interface Entry {
  readonly name: string;
  readonly pattern: Pattern;
}

export function emptyLibrary(): Library {
  return {};
}

/**
 * Two names are one identity when they differ only in case: `bossa` and `Bossa`
 * name the same pattern. Folding decides identity only — never appearance, so
 * the name a drummer typed is the name they are shown.
 */
function sameName(one: string, other: string): boolean {
  return one.toLowerCase() === other.toLowerCase();
}

/**
 * The library with `pattern` kept under `name`, replacing whatever that name
 * already held. Input untouched.
 *
 * A replacement adopts the new spelling rather than the old one: the name
 * travels with the pattern it names.
 */
export function keep(library: Library, name: string, pattern: Pattern): Library {
  return { ...remove(library, name), [name]: pattern };
}

/**
 * The library without whatever `name` held. Input untouched, and a name that was
 * never kept is not an error — the library is already as asked for.
 *
 * Removal goes by identity like everything else, so a row can be dropped under
 * any spelling of the name it is shown under.
 */
export function remove(library: Library, name: string): Library {
  const kept: Record<string, Pattern> = {};
  for (const [existing, value] of Object.entries(library)) {
    if (!sameName(existing, name)) kept[existing] = value;
  }
  return kept;
}

/** The entries, as a list something can be rendered from. */
export function entriesOf(library: Library): readonly Entry[] {
  return Object.entries(library).map(([name, pattern]) => ({ name, pattern }));
}
