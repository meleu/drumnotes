/**
 * Patterns kept by name. Pure immutable value, like the patterns it holds — no
 * storage, no runes, no DOM.
 *
 * The name is the identity: no generated ids, no renaming, so saving under a
 * name already kept replaces it.
 */

import type { Pattern } from './pattern.js';
import { samePattern } from './pattern.js';

/** Name to pattern. Name stored exactly as typed. */
export type Library = Readonly<Record<string, Pattern>>;

/** One row: the name, and the pattern kept under it. */
export interface Entry {
  readonly name: string;
  readonly pattern: Pattern;
}

export function emptyLibrary(): Library {
  return {};
}

/**
 * Case-only difference is one identity: `bossa` and `Bossa` name the same
 * pattern. Folding decides identity only, never appearance — the drummer is
 * shown the name they typed.
 */
export function sameName(one: string, other: string): boolean {
  return one.toLowerCase() === other.toLowerCase();
}

/**
 * Library with `pattern` under `name`, replacing whatever that name held. Input
 * untouched. A replacement adopts the new spelling: the name travels with the
 * pattern it names.
 */
export function keep(library: Library, name: string, pattern: Pattern): Library {
  return { ...remove(library, name), [name]: pattern };
}

/**
 * Library without whatever `name` held. Input untouched; an unkept name is not
 * an error. By identity, so a row drops under any spelling of its name.
 */
export function remove(library: Library, name: string): Library {
  const kept: Record<string, Pattern> = {};
  for (const [existing, value] of Object.entries(library)) {
    if (!sameName(existing, name)) kept[existing] = value;
  }
  return kept;
}

/**
 * Whether a name is already an identity here — what a save asks before
 * overwriting a kept groove, and what the series below steps over.
 */
export function holds(library: Library, name: string): boolean {
  return Object.keys(library).some((existing) => sameName(existing, name));
}

/** Long enough to describe the music, short enough that a row stays a row. */
export const MAX_NAME_LENGTH = 40;

/** What an unnamed groove is offered, numbered from one. */
const SERIES = 'Pattern';

/**
 * Lowest unkept `Pattern N` — first gap, not highest plus one, so a library of
 * `Pattern 9` and `Pattern 10` offers `Pattern 1` rather than counting upwards.
 * Terminates: one of the first `size + 1` numbers must be free.
 */
export function freeName(library: Library): string {
  for (let number = 1; ; number += 1) {
    const candidate = `${SERIES} ${number}`;
    if (!holds(library, candidate)) return candidate;
  }
}

/**
 * Counting order: digit runs compare as numbers (`Pattern 2` before
 * `Pattern 10`), case ignored (`bossa` sits with `Bossa`). Locale pinned rather
 * than left to the browser — row order is part of what the app does, not of the
 * machine it runs on.
 */
const byName = new Intl.Collator('en', { numeric: true, sensitivity: 'accent' });

/**
 * Entries in name order — the only order there is. Sorting here, not at the
 * call site, means a list can never render unsorted, and it settles the stored
 * map's own order, which a JS object mangles once a name is all digits.
 */
export function entriesOf(library: Library): readonly Entry[] {
  return Object.entries(library)
    .map(([name, pattern]) => ({ name, pattern }))
    .sort((one, other) => byName.compare(one.name, other.name));
}

/**
 * Name this library keeps that exact pattern under, else null. By value, so the
 * grid's copy finds the kept copy.
 *
 * The whole of "is the grid already kept?": derived per ask, not remembered, so
 * a changed cell diverges at once and there's no dirty flag to keep honest.
 *
 * Searching listed order, not stored order, keeps the answer independent of
 * save times — one groove under two names always names the same row.
 */
export function nameOf(library: Library, pattern: Pattern): string | null {
  return entriesOf(library).find((entry) => samePattern(entry.pattern, pattern))?.name ?? null;
}
