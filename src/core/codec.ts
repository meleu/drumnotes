/**
 * Persistence codec: `Pattern` ↔ versioned payload. Pure — strings, not storage.
 *
 * Parsing never throws: anything unreadable, mis-shaped or of an unknown schema
 * resolves to the default pattern, so rotted data still lands on a groove.
 *
 * One version back is lifted rather than discarded: a groove written before
 * articulations existed is still that groove, every written cell a plain hit.
 */

import type { Articulation, InstrumentId, Lanes, Pattern } from './pattern.js';
import {
  ARTICULATIONS,
  INSTRUMENTS,
  MAX_TEMPO,
  MIN_TEMPO,
  TOTAL_STEPS,
  defaultPattern,
} from './pattern.js';

/** Bump on payload shape change, and give the old version a lift below — or
 *  older payloads are discarded. */
export const SCHEMA_VERSION = 2;

/** Cells were booleans here; everything else about the payload is unchanged. */
const BOOLEAN_CELLS_VERSION = 1;

interface StoredPattern {
  readonly version: number;
  readonly tempo: number;
  readonly lanes: Readonly<Record<InstrumentId, readonly Articulation[]>>;
}

export function serialisePattern(pattern: Pattern): string {
  const stored: StoredPattern = {
    version: SCHEMA_VERSION,
    tempo: pattern.tempo,
    lanes: pattern.lanes,
  };
  return JSON.stringify(stored);
}

/** How each readable version spells one cell. */
const CELL_READERS: ReadonlyMap<number, (value: unknown) => Articulation | undefined> = new Map([
  [SCHEMA_VERSION, readArticulation],
  [BOOLEAN_CELLS_VERSION, liftBoolean],
]);

export function parsePattern(text: string | null | undefined): Pattern {
  const payload = readJson(text);
  if (!isRecord(payload)) return defaultPattern();

  const readCell =
    typeof payload.version === 'number' ? CELL_READERS.get(payload.version) : undefined;
  if (readCell === undefined) return defaultPattern();

  const tempo = payload.tempo;
  if (!isValidTempo(tempo)) return defaultPattern();

  const lanes = readLanes(payload.lanes, readCell);
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

/** A name outside the vocabulary rejects the payload rather than resolving to
 *  silence: a lane the app cannot read is not a lane it should half-play. */
function readArticulation(value: unknown): Articulation | undefined {
  return ARTICULATIONS.find((articulation) => articulation === value);
}

/** Version 1's cell: written meant a plain hit, and nothing else existed. */
function liftBoolean(value: unknown): Articulation | undefined {
  if (typeof value !== 'boolean') return undefined;
  return value ? 'normal' : 'empty';
}

/** Exactly one lane per known instrument: an unknown id, a missing lane or a
 *  wrong length rejects the whole payload. */
function readLanes(
  value: unknown,
  readCell: (cell: unknown) => Articulation | undefined,
): Lanes | undefined {
  if (!isRecord(value)) return undefined;

  const ids = INSTRUMENTS.map((instrument) => instrument.id);
  if (Object.keys(value).length !== ids.length) return undefined;

  const lanes = {} as Record<InstrumentId, readonly Articulation[]>;
  for (const id of ids) {
    const lane = readLane(value[id], readCell);
    if (lane === undefined) return undefined;
    lanes[id] = lane;
  }
  return lanes;
}

function readLane(
  value: unknown,
  readCell: (cell: unknown) => Articulation | undefined,
): readonly Articulation[] | undefined {
  if (!Array.isArray(value) || value.length !== TOTAL_STEPS) return undefined;

  const lane: Articulation[] = [];
  for (const cell of value) {
    const articulation = readCell(cell);
    if (articulation === undefined) return undefined;
    lane.push(articulation);
  }
  return lane;
}
