import { describe, expect, it } from 'vitest';

import { emptyLibrary, entriesOf, keep, remove } from './library.js';
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

describe('remove', () => {
  it('drops the entry kept under the name', () => {
    const library = keep(emptyLibrary(), 'Bossa', defaultPattern());

    expect(entriesOf(remove(library, 'Bossa'))).toEqual([]);
  });

  it('leaves the library it was given untouched', () => {
    const before = keep(emptyLibrary(), 'Bossa', defaultPattern());

    remove(before, 'Bossa');

    expect(names(before)).toEqual(['Bossa']);
  });

  it('leaves every other entry where it was', () => {
    const library = keep(keep(emptyLibrary(), 'Bossa', defaultPattern()), 'Funk', emptyPattern());

    expect(names(remove(library, 'Bossa'))).toEqual(['Funk']);
  });

  it('removes by identity, so a name differing only in case still finds it', () => {
    const library = keep(emptyLibrary(), 'Bossa', defaultPattern());

    expect(names(remove(library, 'bossa'))).toEqual([]);
  });

  it('changes nothing when the name was never kept', () => {
    const library = keep(emptyLibrary(), 'Bossa', defaultPattern());

    expect(names(remove(library, 'Funk'))).toEqual(['Bossa']);
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
