import { describe, expect, it } from 'vitest';

import {
  emptyLibrary,
  entriesOf,
  freeName,
  holds,
  keep,
  nameOf,
  remove,
  sameName,
} from './library.js';
import { defaultPattern, emptyPattern, toggleStep, withTempo } from './pattern.js';

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

describe('holds', () => {
  it('says no of an empty library', () => {
    expect(holds(emptyLibrary(), 'Bossa')).toBe(false);
  });

  it('says yes of a name that was kept', () => {
    expect(holds(keep(emptyLibrary(), 'Bossa', defaultPattern()), 'Bossa')).toBe(true);
  });

  it('says yes of a name differing only in case, that being one identity', () => {
    expect(holds(keep(emptyLibrary(), 'Bossa', defaultPattern()), 'bossa')).toBe(true);
  });

  it('says no of a name that is merely similar', () => {
    expect(holds(keep(emptyLibrary(), 'Bossa', defaultPattern()), 'Bossa Nova')).toBe(false);
  });
});

describe('sameName', () => {
  it('holds of two spellings of one identity', () => {
    expect(sameName('bossa', 'BOSSA')).toBe(true);
  });

  it('fails of two different names', () => {
    expect(sameName('Bossa', 'Funk')).toBe(false);
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

describe('nameOf', () => {
  it('names nothing when the library is empty', () => {
    expect(nameOf(emptyLibrary(), defaultPattern())).toBe(null);
  });

  it('names the entry holding an equal pattern, though it is a separate value', () => {
    const library = keep(emptyLibrary(), 'Bossa', defaultPattern());

    expect(nameOf(library, defaultPattern())).toBe('Bossa');
  });

  it('names nothing when only the tempo differs', () => {
    const library = keep(emptyLibrary(), 'Bossa', defaultPattern());

    expect(nameOf(library, withTempo(defaultPattern(), 140))).toBe(null);
  });

  it('names nothing when only a lane differs', () => {
    const library = keep(emptyLibrary(), 'Bossa', defaultPattern());

    expect(nameOf(library, toggleStep(defaultPattern(), 'snare', 0))).toBe(null);
  });

  it('picks the entry out from among others', () => {
    const library = keep(keep(emptyLibrary(), 'Bossa', defaultPattern()), 'Funk', emptyPattern());

    expect(nameOf(library, emptyPattern())).toBe('Funk');
  });

  /* Nothing stops the same groove being kept twice under two names, and the row
     marked has to be the same one every time it is asked about. */
  it('names only the first in listed order when two entries are the same pattern', () => {
    const library = keep(
      keep(emptyLibrary(), 'Samba', defaultPattern()),
      'Bossa',
      defaultPattern(),
    );

    expect(nameOf(library, defaultPattern())).toBe('Bossa');
  });
});

/** A library holding one pattern under each name, saved in the order given. */
function libraryOf(...kept: string[]): ReturnType<typeof emptyLibrary> {
  return kept.reduce((library, name) => keep(library, name, defaultPattern()), emptyLibrary());
}

describe('freeName', () => {
  it('starts the series at one when nothing is kept', () => {
    expect(freeName(emptyLibrary())).toBe('Pattern 1');
  });

  it('offers the first gap rather than the highest number plus one', () => {
    expect(freeName(libraryOf('Pattern 1', 'Pattern 3'))).toBe('Pattern 2');
  });

  it('goes back to the lowest free number when the high ones are taken', () => {
    expect(freeName(libraryOf('Pattern 9', 'Pattern 10'))).toBe('Pattern 1');
  });

  it('counts past a run with no gaps in it', () => {
    expect(freeName(libraryOf('Pattern 1', 'Pattern 2', 'Pattern 3'))).toBe('Pattern 4');
  });

  it('treats a name differing only in case as taken', () => {
    expect(freeName(libraryOf('pattern 1', 'PATTERN 2'))).toBe('Pattern 3');
  });

  it('ignores names that are not in the series', () => {
    expect(freeName(libraryOf('Bossa', 'Pattern', 'Pattern 1x', '1'))).toBe('Pattern 1');
  });
});

describe('the order entries are listed in', () => {
  it('reads alphabetically when there are no digits', () => {
    expect(names(libraryOf('Samba', 'Bossa', 'Funk'))).toEqual(['Bossa', 'Funk', 'Samba']);
  });

  it('compares a run of digits as a number, not as text', () => {
    expect(names(libraryOf('Pattern 10', 'Pattern 2'))).toEqual(['Pattern 2', 'Pattern 10']);
  });

  it('compares names that are entirely digits as numbers too', () => {
    expect(names(libraryOf('10', '9', '100'))).toEqual(['9', '10', '100']);
  });

  it('ignores case, so lower-case names are not banished to the end', () => {
    expect(names(libraryOf('cherry', 'apple', 'Banana'))).toEqual(['apple', 'Banana', 'cherry']);
  });

  it('does not depend on the order things were saved in', () => {
    expect(names(libraryOf('Funk', 'Bossa'))).toEqual(names(libraryOf('Bossa', 'Funk')));
  });
});
