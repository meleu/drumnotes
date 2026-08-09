import { describe, expect, it } from 'vitest';

import {
  MAX_TEMPO,
  MIN_TEMPO,
  TOTAL_STEPS,
  defaultPattern,
  emptyPattern,
  toggleStep,
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

describe('serialisePattern', () => {
  it('round-trips a pattern back to an equal value', () => {
    const pattern = toggleStep(toggleStep(defaultPattern(), 'kick', 5), 'hihat', 0);

    expect(parsePattern(serialisePattern(pattern))).toEqual(pattern);
  });

  it('carries an explicit schema version', () => {
    expect(payload().version).toBe(SCHEMA_VERSION);
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
    ['a short lane', corrupt({ lanes: { ...storedLanes(), snare: laneOf(3, false) } })],
    ['a long lane', corrupt({ lanes: { ...storedLanes(), kick: laneOf(TOTAL_STEPS + 1, false) } })],
    [
      'a lane of non-booleans',
      corrupt({ lanes: { ...storedLanes(), kick: laneOf(TOTAL_STEPS, 1) } }),
    ],
    ['a missing lane', corrupt({ lanes: without(storedLanes(), 'hihat') })],
    [
      'an unknown instrument id',
      corrupt({ lanes: { ...storedLanes(), cowbell: laneOf(TOTAL_STEPS, false) } }),
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
