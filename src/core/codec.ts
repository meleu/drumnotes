/**
 * Persistence codec: the whole store ↔ text. Pure — strings, not storage.
 *
 * The store is one object holding the pattern on the grid and the library
 * beside it. Its shape is fixed and carries no version of its own; the version
 * rides on each stored pattern, so a later instrument or dynamics change is one
 * bump plus a per-entry upgrade or drop, never a wholesale migration, and a
 * mixed-version library stays readable. The version is checked in one named
 * step, `atCurrentVersion`, which is where that upgrade will go.
 *
 * Two decoding contracts, deliberately different:
 *
 * - The **current pattern decodes totally**. Anything unreadable resolves to the
 *   default pattern, because the grid must show something.
 * - A **library entry decodes partially**. Anything unreadable yields nothing and
 *   the entry is simply absent, so every row listed is a row that will load.
 *
 * Neither ever throws.
 */

import type { Library } from './library.js';
import type { Articulation, InstrumentId, Lanes, Pattern } from './pattern.js';
import {
  ARTICULATIONS,
  INSTRUMENTS,
  MAX_TEMPO,
  MIN_TEMPO,
  TOTAL_STEPS,
  defaultPattern,
} from './pattern.js';

/** Bump on pattern payload shape change, and lift the old version below, else
 *  that payload is discarded. */
export const SCHEMA_VERSION = 2;

/** Cells were booleans; rest of the payload unchanged. */
const BOOLEAN_CELLS_VERSION = 1;

/** Everything kept: the pattern on the grid, and the patterns kept by name. */
export interface Store {
  readonly current: Pattern;
  readonly library: Library;
}

interface StoredPattern {
  readonly version: number;
  readonly tempo: number;
  readonly lanes: Readonly<Record<InstrumentId, readonly Articulation[]>>;
}

interface StoredStore {
  readonly current: StoredPattern;
  readonly library: Readonly<Record<string, StoredPattern>>;
}

export function serialiseStore(store: Store): string {
  const stored: StoredStore = {
    current: storedPattern(store.current),
    library: Object.fromEntries(
      Object.entries(store.library).map(([name, pattern]) => [name, storedPattern(pattern)]),
    ),
  };
  return JSON.stringify(stored);
}

export function parseStore(text: string | null | undefined): Store {
  const payload = readJson(text);
  const stored = isRecord(payload) ? payload : {};
  return {
    current: readPattern(stored.current) ?? defaultPattern(),
    library: readLibrary(stored.library),
  };
}

/** The current pattern is stored as just another entry, so it and the library
 *  entries decode through one path and cannot drift apart. */
function storedPattern(pattern: Pattern): StoredPattern {
  return { version: SCHEMA_VERSION, tempo: pattern.tempo, lanes: pattern.lanes };
}

/** Entries that cannot be read are left out rather than mangled; the next write
 *  persists the pruned map. */
function readLibrary(value: unknown): Library {
  if (!isRecord(value)) return {};

  const library: Record<string, Pattern> = {};
  for (const [name, entry] of Object.entries(value)) {
    const pattern = readPattern(entry);
    if (pattern !== undefined) library[name] = pattern;
  }
  return library;
}

/** The partial decode: one stored pattern, or nothing at all. */
function readPattern(value: unknown): Pattern | undefined {
  if (!isRecord(value)) return undefined;

  const readCell = cellReaderFor(value.version);
  if (readCell === undefined) return undefined;

  const tempo = value.tempo;
  if (!isValidTempo(tempo)) return undefined;

  const lanes = readLanes(value.lanes, readCell);
  if (lanes === undefined) return undefined;

  return { tempo, lanes };
}

/** How each readable version spells a cell. */
const CELL_READERS: ReadonlyMap<number, (value: unknown) => Articulation | undefined> = new Map([
  [SCHEMA_VERSION, readArticulation],
  [BOOLEAN_CELLS_VERSION, liftBoolean],
]);

/**
 * The version step: how to read this payload's cells, or nothing when this
 * build cannot read them at all. Every step after it reads the current shape
 * and only the current shape, and may do so because this one has run.
 *
 * A version left behind lives on as a cell reader rather than a migration pass,
 * because that is the whole of what has ever changed between versions. Were a
 * bump to move something else — a new instrument, a lane length — this is where
 * the payload would be brought forward first, and the reader chosen after.
 *
 * That is what keeps a library readable across a bump: without it, `readLanes`'
 * exact-lane-count check would reject every pattern kept before the change, and
 * a drummer would open the app to an empty library.
 */
function cellReaderFor(
  version: unknown,
): ((value: unknown) => Articulation | undefined) | undefined {
  return typeof version === 'number' ? CELL_READERS.get(version) : undefined;
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
