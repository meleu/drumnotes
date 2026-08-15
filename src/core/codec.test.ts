import { describe, expect, it } from 'vitest';

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
} from './pattern.js';
import { SCHEMA_VERSION, parsePattern, serialisePattern } from './codec.js';

/** A well-formed payload, to be corrupted one field at a time. */
function payload(): Record<string, unknown> {
  return JSON.parse(serialisePattern(emptyPattern()));
}

function storedLanes(): Record<string, unknown> {
  return payload().lanes as Record<string, unknown>;
}

function without(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...source };
  delete copy[key];
  return copy;
}

/** The payload with fields replaced, serialised. */
function corrupt(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...payload(), ...overrides });
}

function laneOf(length: number, value: unknown): unknown[] {
  return new Array<unknown>(length).fill(value);
}

/** A version 1 payload: lanes of booleans, as v1.0.0 wrote them. */
function version1(hits: Readonly<Record<string, readonly number[]>>): string {
  const lanes = Object.fromEntries(
    ['hihat', 'snare', 'kick'].map((id) => [
      id,
      Array.from({ length: TOTAL_STEPS }, (_, step) => (hits[id] ?? []).includes(step)),
    ]),
  );
  return JSON.stringify({ version: 1, tempo: DEFAULT_TEMPO, lanes });
}

describe('serialisePattern', () => {
  it('round-trips a pattern back to an equal value', () => {
    const pattern = toggleStep(toggleStep(defaultPattern(), 'kick', 5), 'hihat', 0);

    expect(parsePattern(serialisePattern(pattern))).toEqual(pattern);
  });

  it('round-trips every articulation of the vocabulary', () => {
    const pattern = ARTICULATIONS.reduce(
      (next, articulation, step) => withArticulation(next, 'snare', step, articulation),
      emptyPattern(),
    );

    expect(parsePattern(serialisePattern(pattern))).toEqual(pattern);
  });

  it('carries an explicit schema version', () => {
    expect(payload().version).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('stores lanes as readable articulation names', () => {
    const stored = storedLanes();

    expect(stored.snare).toEqual(new Array<string>(TOTAL_STEPS).fill('empty'));
    expect(
      (JSON.parse(serialisePattern(defaultPattern())).lanes as Record<string, string[]>).snare,
    ).toContain('normal');
  });
});

describe('a version 1 payload', () => {
  it('loads as the same groove, every written cell becoming a plain hit', () => {
    const stored = version1({ hihat: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12], kick: [0, 10] });

    // Bar-relative hits of the landing groove, so the first bar must match it.
    expect(parsePattern(stored).lanes.snare.slice(0, 16)).toEqual(
      defaultPattern().lanes.snare.slice(0, 16),
    );
    expect(parsePattern(stored).tempo).toBe(DEFAULT_TEMPO);
  });

  it('is lifted rather than discarded, whatever it holds', () => {
    expect(parsePattern(version1({ kick: [3] })).lanes.kick[3]).toBe('normal');
    expect(parsePattern(version1({ kick: [3] })).lanes.kick[4]).toBe('empty');
  });

  it('still falls back to the default when mis-shaped', () => {
    const misShaped = JSON.stringify({
      version: 1,
      tempo: DEFAULT_TEMPO,
      lanes: { hihat: [], snare: [], kick: [] },
    });

    expect(parsePattern(misShaped)).toEqual(defaultPattern());
  });
});

describe('parsePattern', () => {
  const unreadable: [name: string, stored: string | null][] = [
    ['nothing stored', null],
    ['empty storage', ''],
    ['invalid JSON', '{not json'],
    ['a payload that is not an object', '"a groove"'],
    ['a payload that is an array', '[]'],
    ['a missing version', JSON.stringify(without(payload(), 'version'))],
    ['an unknown version', corrupt({ version: SCHEMA_VERSION + 1 })],
    ['a version stored as a string', corrupt({ version: String(SCHEMA_VERSION) })],
    ['missing lanes', JSON.stringify(without(payload(), 'lanes'))],
    ['lanes that are not an object', corrupt({ lanes: [] })],
    ['a short lane', corrupt({ lanes: { ...storedLanes(), snare: laneOf(3, 'empty') } })],
    [
      'a long lane',
      corrupt({ lanes: { ...storedLanes(), kick: laneOf(TOTAL_STEPS + 1, 'empty') } }),
    ],
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

  it.each(unreadable)('falls back to the default pattern given %s', (_name, stored) => {
    expect(parsePattern(stored)).toEqual(defaultPattern());
  });

  it.each(unreadable)('does not throw given %s', (_name, stored) => {
    expect(() => parsePattern(stored)).not.toThrow();
  });

  it('accepts the ends of the tempo range', () => {
    for (const tempo of [MIN_TEMPO, MAX_TEMPO]) {
      expect(parsePattern(corrupt({ tempo })).tempo).toBe(tempo);
    }
  });
});
