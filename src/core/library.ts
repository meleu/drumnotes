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
export function sameName(one: string, other: string): boolean {
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

/**
 * Whether a name is already an identity in the library — what a save has to ask
 * about before it writes over a groove the drummer meant to keep, and what the
 * series below has to step over.
 */
export function holds(library: Library, name: string): boolean {
  return Object.keys(library).some((existing) => sameName(existing, name));
}

/** The most a name may run to. Long enough to describe the music, short enough
 *  that a row stays a row. */
export const MAX_NAME_LENGTH = 40;

/** What an unnamed groove is offered, numbered from one. */
const SERIES = 'Pattern';

/**
 * The lowest `Pattern N` not already kept — the first gap, not the highest
 * number plus one, so a library of `Pattern 9` and `Pattern 10` offers
 * `Pattern 1` rather than counting ever upwards.
 *
 * The search cannot run away: one of the first `size + 1` numbers must be free,
 * whatever else the library holds.
 */
export function freeName(library: Library): string {
  for (let number = 1; ; number += 1) {
    const candidate = `${SERIES} ${number}`;
    if (!holds(library, candidate)) return candidate;
  }
}

/**
 * Names in the order a drummer would count them: runs of digits compare as
 * numbers, so `Pattern 2` comes before `Pattern 10`, and case is ignored, so
 * `bossa` sits with `Bossa` rather than in a lower-case district at the end.
 *
 * The locale is pinned rather than left to the browser: the order rows appear
 * in is part of what the app does, and it should not change because the machine
 * it runs on is set up differently.
 */
const byName = new Intl.Collator('en', { numeric: true, sensitivity: 'accent' });

/**
 * The entries, in name order — the only order there is. Sorting here rather
 * than at the call site means a list can never be rendered unsorted, and it
 * also settles the order the stored map happens to have been written in, which
 * a JavaScript object does not keep faithfully once a name is all digits.
 */
export function entriesOf(library: Library): readonly Entry[] {
  return Object.entries(library)
    .map(([name, pattern]) => ({ name, pattern }))
    .sort((one, other) => byName.compare(one.name, other.name));
}
