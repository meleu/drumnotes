/**
 * Persistence codec: `Pattern` ↔ versioned payload. Pure — strings, not storage.
 * Parsing never throws: unreadable, mis-shaped or unknown-schema data resolves
 * to the default pattern. One version back is lifted, not discarded.
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

/** Bump on shape change, and lift the old version below, else it's discarded. */
export const SCHEMA_VERSION = 2;

/** Cells were booleans; rest of the payload unchanged. */
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

/** How each readable version spells a cell. */
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

/** Unknown name rejects the payload, not resolves to silence: an unreadable
 *  lane should not be half-played. */
function readArticulation(value: unknown): Articulation | undefined {
  return ARTICULATIONS.find((articulation) => articulation === value);
}

/** Version 1's cell: written = plain hit, nothing else existed. */
function liftBoolean(value: unknown): Articulation | undefined {
  if (typeof value !== 'boolean') return undefined;
  return value ? 'normal' : 'empty';
}

/** Exactly one lane per known instrument; unknown id, missing lane or wrong
 *  length rejects the whole payload. */
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
