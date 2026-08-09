/**
 * Persistence codec: `Pattern` ↔ versioned payload. Pure — strings, not storage.
 *
 * Parsing never throws: anything unreadable, mis-shaped or of an unknown schema
 * resolves to the default pattern, so rotted data still lands on a groove.
 */

import type { InstrumentId, Lanes, Pattern } from './pattern.js';
import { INSTRUMENTS, MAX_TEMPO, MIN_TEMPO, TOTAL_STEPS, defaultPattern } from './pattern.js';

/** Bump on payload shape change; older payloads are discarded. */
export const SCHEMA_VERSION = 1;

interface StoredPattern {
  readonly version: number;
  readonly tempo: number;
  readonly lanes: Readonly<Record<InstrumentId, readonly boolean[]>>;
}

export function serialisePattern(pattern: Pattern): string {
  const stored: StoredPattern = {
    version: SCHEMA_VERSION,
    tempo: pattern.tempo,
    lanes: pattern.lanes,
  };
  return JSON.stringify(stored);
}

export function parsePattern(text: string | null | undefined): Pattern {
  const payload = readJson(text);
  if (!isRecord(payload)) return defaultPattern();
  if (payload.version !== SCHEMA_VERSION) return defaultPattern();

  const tempo = payload.tempo;
  if (!isValidTempo(tempo)) return defaultPattern();

  const lanes = readLanes(payload.lanes);
  if (lanes === undefined) return defaultPattern();

  return { tempo, lanes };
}

function readJson(text: string | null | undefined): unknown {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidTempo(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && isInRange(value);
}

function isInRange(tempo: number): boolean {
  return tempo >= MIN_TEMPO && tempo <= MAX_TEMPO;
}

/** Exactly one lane per known instrument: an unknown id, a missing lane or a
 *  wrong length rejects the whole payload. */
function readLanes(value: unknown): Lanes | undefined {
  if (!isRecord(value)) return undefined;

  const ids = INSTRUMENTS.map((instrument) => instrument.id);
  if (Object.keys(value).length !== ids.length) return undefined;

  const lanes = {} as Record<InstrumentId, readonly boolean[]>;
  for (const id of ids) {
    const lane = value[id];
    if (!isLane(lane)) return undefined;
    lanes[id] = lane;
  }
  return lanes;
}

function isLane(value: unknown): value is boolean[] {
  return (
    Array.isArray(value) &&
    value.length === TOTAL_STEPS &&
    value.every((step) => typeof step === 'boolean')
  );
}
