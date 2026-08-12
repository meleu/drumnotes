import { describe, expect, it } from 'vitest';

import { emptyLibrary, entriesOf, keep } from './library.js';
import { defaultPattern, emptyPattern, withTempo } from './pattern.js';

/** Names of the entries, in the order they are listed. */
function names(library: ReturnType<typeof emptyLibrary>): string[] {
  return entriesOf(library).map((entry) => entry.name);
}

describe('keep', () => {
  it('adds a pattern under the name given', () => {
    const library = keep(emptyLibrary(), 'Bossa', defaultPattern());

    expect(entriesOf(library)).toEqual([{ name: 'Bossa', pattern: defaultPattern() }]);
  });

  it('leaves the library it was given untouched', () => {
    const before = emptyLibrary();

    keep(before, 'Bossa', defaultPattern());

    expect(entriesOf(before)).toEqual([]);
  });

  it('keeps patterns saved under different names side by side', () => {
    const library = keep(keep(emptyLibrary(), 'Bossa', defaultPattern()), 'Funk', emptyPattern());

    expect(names(library)).toEqual(['Bossa', 'Funk']);
  });

  it('replaces the entry when the same name is saved again', () => {
    const faster = withTempo(defaultPattern(), 120);

    const library = keep(keep(emptyLibrary(), 'Bossa', defaultPattern()), 'Bossa', faster);

    expect(entriesOf(library)).toEqual([{ name: 'Bossa', pattern: faster }]);
  });

  it('treats a name differing only in case as the same pattern', () => {
    const library = keep(keep(emptyLibrary(), 'Bossa', defaultPattern()), 'bossa', emptyPattern());

    expect(entriesOf(library)).toHaveLength(1);
  });

  it('stores the name as typed, so replacing renames the row', () => {
    const library = keep(keep(emptyLibrary(), 'Bossa', defaultPattern()), 'bossa', emptyPattern());

    expect(names(library)).toEqual(['bossa']);
  });
});

describe('entriesOf', () => {
  it('lists nothing for an empty library', () => {
    expect(entriesOf(emptyLibrary())).toEqual([]);
  });

  it('carries the pattern each name was saved with', () => {
    const library = keep(emptyLibrary(), 'Funk', withTempo(emptyPattern(), 140));

    expect(entriesOf(library)[0]?.pattern.tempo).toBe(140);
  });
});
