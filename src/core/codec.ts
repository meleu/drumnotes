/**
 * The persistence codec: a `Pattern` to a versioned payload and back. Pure —
 * it knows nothing about local storage, only about strings.
 *
 * Parsing never throws. Anything unreadable, mis-shaped or written by a schema
 * this build does not know resolves to the default pattern, so a drummer whose
 * saved data has rotted still lands on a working groove.
 */

import type { InstrumentId, Lanes, Pattern } from './pattern.js';
import { INSTRUMENTS, MAX_TEMPO, MIN_TEMPO, TOTAL_STEPS, defaultPattern } from './pattern.js';

/** Bumped whenever the payload shape changes; older payloads are then discarded. */
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

/**
 * Accepts exactly one lane per known instrument and nothing else: an unknown
 * id, a missing lane or a lane of the wrong length rejects the whole payload.
 */
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
