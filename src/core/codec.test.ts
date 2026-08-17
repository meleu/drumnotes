import { describe, expect, it } from 'vitest';

import { emptyLibrary, entriesOf, keep } from './library.js';
import type { Pattern } from './pattern.js';
import {
  ARTICULATIONS,
  DEFAULT_TEMPO,
  MAX_TEMPO,
  MIN_TEMPO,
  TOTAL_STEPS,
  defaultPattern,
  emptyPattern,
  toggleStep,
  withArticulation,
  withTempo,
} from './pattern.js';
import { SCHEMA_VERSION, parseStore, serialiseStore } from './codec.js';

/** A well-formed stored pattern, to be corrupted one field at a time. */
function payload(): Record<string, unknown> {
  return storedForm(emptyPattern());
}

/** How a pattern is written down, read back off a serialised store. */
function storedForm(pattern: Pattern): Record<string, unknown> {
  const text = serialiseStore({ current: pattern, library: emptyLibrary() });
  return (JSON.parse(text) as { current: Record<string, unknown> }).current;
}

function storedLanes(): Record<string, unknown> {
  return payload().lanes as Record<string, unknown>;
}

function without(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...source };
  delete copy[key];
  return copy;
}

/** The stored pattern with fields replaced. */
function corrupt(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...payload(), ...overrides };
}

/** A serialised store holding whatever is offered as its current pattern. */
function storeWith(current: unknown): string {
  return JSON.stringify({ current, library: {} });
}

/** A serialised store holding whatever library entries are offered, over a
 *  readable current pattern. */
function storeWithLibrary(library: Record<string, unknown>): string {
  return JSON.stringify({ current: payload(), library });
}

function laneOf(length: number, value: unknown): unknown[] {
  return new Array<unknown>(length).fill(value);
}

/** A v1 stored pattern: boolean lanes, as v1.0.0 wrote them. */
function version1(hits: Readonly<Record<string, readonly number[]>>): Record<string, unknown> {
  const lanes = Object.fromEntries(
    ['hihat', 'snare', 'kick'].map((id) => [
      id,
      Array.from({ length: TOTAL_STEPS }, (_, step) => (hits[id] ?? []).includes(step)),
    ]),
  );
  return { version: 1, tempo: DEFAULT_TEMPO, lanes };
}

/** A version no build has ever written, and none can read. */
const UNREADABLE_VERSION = 0;

function namesIn(text: string): string[] {
  return entriesOf(parseStore(text).library).map((entry) => entry.name);
}

const unreadableStores: [name: string, stored: string | null][] = [
  ['nothing stored', null],
  ['empty storage', ''],
  ['invalid JSON', '{not json'],
  ['a store that is not an object', '"a groove"'],
  ['a store that is an array', '[]'],
  ['a store with no current pattern', '{}'],
];

/** Every way one stored pattern can be unreadable. Both contracts run against
 *  this list, so neither can quietly stop checking something. */
const unreadablePatterns: [name: string, stored: unknown][] = [
  ['nothing at all', undefined],
  ['a pattern that is not an object', 'a groove'],
  ['a pattern that is an array', []],
  ['a pattern that is null', null],
  ['rotted JSON in place of a pattern', '{"version":'],
  ['a missing version', without(payload(), 'version')],
  ['a newer version', corrupt({ version: SCHEMA_VERSION + 1 })],
  ['a version older than any this build reads', corrupt({ version: UNREADABLE_VERSION })],
  ['a version stored as a string', corrupt({ version: String(SCHEMA_VERSION) })],
  ['missing lanes', without(payload(), 'lanes')],
  ['lanes that are not an object', corrupt({ lanes: [] })],
  ['a short lane', corrupt({ lanes: { ...storedLanes(), snare: laneOf(3, 'empty') } })],
  ['a long lane', corrupt({ lanes: { ...storedLanes(), kick: laneOf(TOTAL_STEPS + 1, 'empty') } })],
  [
    'a lane of booleans at this version',
    corrupt({ lanes: { ...storedLanes(), kick: laneOf(TOTAL_STEPS, true) } }),
  ],
  [
    'a lane naming an articulation the vocabulary does not have',
    corrupt({ lanes: { ...storedLanes(), kick: laneOf(TOTAL_STEPS, 'rimshot') } }),
  ],
  ['a missing lane', corrupt({ lanes: without(storedLanes(), 'hihat') })],
  [
    'an unknown instrument id',
    corrupt({ lanes: { ...storedLanes(), cowbell: laneOf(TOTAL_STEPS, 'empty') } }),
  ],
  ['a non-numeric tempo', corrupt({ tempo: 'fast' })],
  ['a tempo that is not a number at all', corrupt({ tempo: null })],
  ['a tempo below the range', corrupt({ tempo: MIN_TEMPO - 1 })],
  ['a tempo above the range', corrupt({ tempo: MAX_TEMPO + 1 })],
];

/** Both routes to an unreadable current pattern: a rotted store, and a
 *  readable store holding a rotted pattern. */
const unreadable: [name: string, stored: string | null][] = [
  ...unreadableStores,
  ...unreadablePatterns.map<[string, string]>(([name, current]) => [name, storeWith(current)]),
];

describe('serialiseStore', () => {
  it('round-trips the current pattern back to an equal value', () => {
    const current = toggleStep(toggleStep(defaultPattern(), 'kick', 5), 'hihat', 0);

    const store = parseStore(serialiseStore({ current, library: emptyLibrary() }));

    expect(store.current).toEqual(current);
  });

  it('round-trips every articulation of the vocabulary', () => {
    const current = ARTICULATIONS.reduce(
      (next, articulation, step) => withArticulation(next, 'snare', step, articulation),
      emptyPattern(),
    );

    const store = parseStore(serialiseStore({ current, library: emptyLibrary() }));

    expect(store.current).toEqual(current);
  });

  it('round-trips the library back to equal entries', () => {
    const library = keep(
      keep(emptyLibrary(), 'Bossa', withTempo(defaultPattern(), 120)),
      'Funk',
      emptyPattern(),
    );

    const store = parseStore(serialiseStore({ current: defaultPattern(), library }));

    expect(entriesOf(store.library)).toEqual(entriesOf(library));
  });

  it('versions each stored pattern rather than the store as a whole', () => {
    const text = serialiseStore({
      current: defaultPattern(),
      library: keep(emptyLibrary(), 'Bossa', emptyPattern()),
    });

    const stored = JSON.parse(text) as Record<string, unknown>;
    expect(stored.version).toBeUndefined();
    expect(payload().version).toBe(SCHEMA_VERSION);
    expect((stored.library as Record<string, { version: number }>).Bossa?.version).toBe(
      SCHEMA_VERSION,
    );
  });

  it('stores lanes as readable articulation names', () => {
    expect(storedForm(emptyPattern()).lanes).toEqual({
      hihat: laneOf(TOTAL_STEPS, 'empty'),
      snare: laneOf(TOTAL_STEPS, 'empty'),
      kick: laneOf(TOTAL_STEPS, 'empty'),
    });
    expect((storedForm(defaultPattern()).lanes as Record<string, string[]>).snare).toContain(
      'normal',
    );
  });
});

describe('a version 1 stored pattern', () => {
  it('loads as the same groove, every written cell becoming a plain hit', () => {
    const stored = version1({ hihat: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12], kick: [0, 10] });

    const { current } = parseStore(storeWith(stored));

    // Bar-relative hits of the landing groove: the first bar must match.
    expect(current.lanes.snare.slice(0, 16)).toEqual(defaultPattern().lanes.snare.slice(0, 16));
    expect(current.tempo).toBe(DEFAULT_TEMPO);
  });

  it('is lifted rather than discarded, whatever it holds', () => {
    const { current } = parseStore(storeWith(version1({ kick: [3] })));

    expect(current.lanes.kick[3]).toBe('normal');
    expect(current.lanes.kick[4]).toBe('empty');
  });

  // Why entries carry the version, not the store: a library kept before the
  // vocabulary grew still lists, and still loads.
  it('is lifted in the library too, beside an entry at the current version', () => {
    const text = storeWithLibrary({
      Rock: version1({ kick: [3] }),
      Funk: storedForm(withTempo(emptyPattern(), 120)),
    });

    const { library } = parseStore(text);

    expect(namesIn(text)).toEqual(['Funk', 'Rock']);
    expect(library.Rock?.lanes.kick[3]).toBe('normal');
  });

  it('still falls back to the default when mis-shaped', () => {
    const misShaped = {
      version: 1,
      tempo: DEFAULT_TEMPO,
      lanes: { hihat: [], snare: [], kick: [] },
    };

    expect(parseStore(storeWith(misShaped)).current).toEqual(defaultPattern());
  });
});

describe('parseStore', () => {
  it.each(unreadable)('falls back to the default pattern given %s', (_name, stored) => {
    expect(parseStore(stored).current).toEqual(defaultPattern());
  });

  it.each(unreadable)('does not throw given %s', (_name, stored) => {
    expect(() => parseStore(stored)).not.toThrow();
  });

  it.each(unreadableStores)('yields an empty library given %s', (_name, stored) => {
    expect(entriesOf(parseStore(stored).library)).toEqual([]);
  });

  it('accepts the ends of the tempo range', () => {
    for (const tempo of [MIN_TEMPO, MAX_TEMPO]) {
      expect(parseStore(storeWith(corrupt({ tempo }))).current.tempo).toBe(tempo);
    }
  });
});

/** Both contracts against one list of rot, so their difference is the only
 *  thing these tests read. */
describe('the two decoding contracts, side by side', () => {
  it.each(unreadablePatterns)('leaves a library entry out given %s', (_name, entry) => {
    expect(namesIn(storeWithLibrary({ Bossa: entry }))).toEqual([]);
  });

  it.each(unreadablePatterns)(
    'falls back for the current pattern given %s, where an entry is dropped',
    (_name, stored) => {
      const store = parseStore(JSON.stringify({ current: stored, library: { Bossa: stored } }));

      expect(store.current).toEqual(defaultPattern());
      expect(entriesOf(store.library)).toEqual([]);
    },
  );

  it.each(unreadablePatterns)('lists the readable entries beside one with %s', (_name, entry) => {
    const store = parseStore(storeWithLibrary({ Bossa: payload(), Rotted: entry }));

    expect(entriesOf(store.library)).toEqual([{ name: 'Bossa', pattern: emptyPattern() }]);
  });

  it('reads every version it knows and leaves out the rest of a mixed-version library', () => {
    const mixed = storeWithLibrary({
      Bossa: payload(),
      Funk: version1({ kick: [3] }),
      Newer: corrupt({ version: SCHEMA_VERSION + 1 }),
      Older: corrupt({ version: UNREADABLE_VERSION }),
    });

    expect(namesIn(mixed)).toEqual(['Bossa', 'Funk']);
  });

  it('lists a readable entry even when the current pattern is unreadable', () => {
    const text = JSON.stringify({ current: '{"version":', library: { Bossa: payload() } });

    expect(parseStore(text).current).toEqual(defaultPattern());
    expect(namesIn(text)).toEqual(['Bossa']);
  });
});
