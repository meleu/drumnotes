import { readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, test } from 'vitest';

import type { Dynamic, InstrumentId } from '../core/pattern.js';
import { DYNAMICS, INSTRUMENTS } from '../core/pattern.js';
import { SAMPLE_URLS, createDrumKit } from './audio.js';

/** Enough Web Audio to exercise the kit in node. The real `AudioContext` has
 *  the same shape; the casts are the seam to the stand-in. */
class FakeSource {
  buffer: AudioBuffer | null = null;
  connectedTo: unknown = null;
  startedAt: number | undefined = undefined;
  stopped = false;
  onended: (() => void) | null = null;

  connect(destination: unknown): void {
    this.connectedTo = destination;
  }

  start(when?: number): void {
    this.startedAt = when;
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  readonly destination = { name: 'destination' };
  resumeCount = 0;
  readonly fetched: string[] = [];
  readonly decoded: ArrayBuffer[] = [];
  readonly sources: FakeSource[] = [];

  async resume(): Promise<void> {
    this.resumeCount += 1;
    this.state = 'running';
  }

  async decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> {
    this.decoded.push(bytes);
    return { byteLength: bytes.byteLength } as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  fetchSample = async (url: string): Promise<ArrayBuffer> => {
    this.fetched.push(url);
    return new ArrayBuffer(url.length);
  };

  asContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

/** One url per instrument per rung — the shape the real table has. */
const SOURCES = Object.fromEntries(
  INSTRUMENTS.map(({ id }) => [
    id,
    Object.fromEntries(DYNAMICS.map((dynamic) => [dynamic, `/samples/${id}-${dynamic}.wav`])),
  ]),
) as Record<InstrumentId, Record<Dynamic, string>>;

const SAMPLE_COUNT = INSTRUMENTS.length * DYNAMICS.length;

/** Where the kit is committed, and what the app is entitled to reference. */
const KIT_DIR = 'src/assets/samples/GMRockKit';

/**
 * The kit as committed: four rungs for every instrument the app plays or has
 * left room to play, plus the closed hi-hat's `-Soft`, which is its plain rung.
 */
const KIT_INSTRUMENTS = [
  'HatClosed',
  'HatOpen',
  'HatPedal',
  'Snare',
  'Kick',
  'Ride',
  'Crash',
  'Tom1',
  'Tom2',
  'TomFloor',
];
const KIT_RUNGS = ['Softest', 'Med', 'Hard', 'Hardest'];

test("commits the whole kit, under the kit's own filenames", () => {
  const expected = [
    ...KIT_INSTRUMENTS.flatMap((id) => KIT_RUNGS.map((rung) => `${id}-${rung}.wav`)),
    'HatClosed-Soft.wav',
  ];

  expect(readdirSync(KIT_DIR).toSorted()).toEqual(expected.toSorted());
});

test('references a subset of what is committed, so the build carries no more', () => {
  const committed = new Set(readdirSync(KIT_DIR));
  const referenced = Object.values(SAMPLE_URLS).flatMap((rungs) =>
    Object.values(rungs).map((url) => basename(url)),
  );

  // Static imports, one per rung: an unreferenced file cannot reach the bundle,
  // and a glob over the directory would drag all forty-one in.
  expect(referenced).toHaveLength(INSTRUMENTS.length * DYNAMICS.length);
  expect(new Set(referenced).size).toBe(referenced.length);
  for (const file of referenced) expect(committed).toContain(file);
  expect(referenced.length).toBeLessThan(committed.size);
});

test('names a recording for every instrument at every rung', () => {
  for (const { id } of INSTRUMENTS) {
    for (const dynamic of DYNAMICS) {
      expect(SAMPLE_URLS[id][dynamic], `${id} at ${dynamic}`).toMatch(/\.wav$/);
    }
  }
});

test('reads the closed hi-hat plainly as Soft, the one instrument that does', () => {
  // The kit's own -Med closed hi-hat is louder than the groove wants under it;
  // -Soft is the plain rung here and nowhere else. A fact about these files,
  // which is why it lives in this table and not in the core.
  expect(SAMPLE_URLS.hihat.plain).toMatch(/HatClosed-Soft[-.]/);
  expect(SAMPLE_URLS.snare.plain).toMatch(/Snare-Med[-.]/);
  expect(SAMPLE_URLS.kick.plain).toMatch(/Kick-Med[-.]/);
});

test('reads the hardest rung the same way for every instrument, hi-hat included', () => {
  expect(SAMPLE_URLS.hihat.hardest).toMatch(/HatClosed-Hardest[-.]/);
  expect(SAMPLE_URLS.snare.hardest).toMatch(/Snare-Hardest[-.]/);
  expect(SAMPLE_URLS.kick.hardest).toMatch(/Kick-Hardest[-.]/);
});

test('sounds the recording asked for, not another rung of the same drum', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  kit.play('snare', 'plain');
  kit.play('snare', 'hardest');

  const [plain, hardest] = context.sources;
  expect(plain?.buffer).not.toBe(hardest?.buffer);
});

test('decodes every sample exactly once', async () => {
  const context = new FakeContext();

  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  expect(context.fetched.toSorted()).toEqual(
    Object.values(SOURCES)
      .flatMap((rungs) => Object.values(rungs))
      .toSorted(),
  );
  expect(context.decoded).toHaveLength(SAMPLE_COUNT);
});

test('reuses one decoded buffer across hits, through a fresh source node each time', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  kit.play('snare', 'plain');
  kit.play('snare', 'plain');

  expect(context.decoded).toHaveLength(SAMPLE_COUNT);
  expect(context.sources).toHaveLength(2);
  const [first, second] = context.sources;
  expect(first).not.toBe(second);
  expect(first?.buffer).toBe(second?.buffer);
});

test('starts the hit at once rather than at a scheduled time', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  kit.play('kick', 'plain');

  expect(context.sources[0]?.startedAt).toBeUndefined();
  expect(context.sources[0]?.connectedTo).toBe(context.destination);
});

test('stays silent when asked for an instrument that has not decoded yet', () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);

  kit.play('hihat', 'plain');

  expect(context.sources).toHaveLength(0);
});

test('sounds a scheduled hit at the time it was given', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  kit.play('hihat', 'plain', 12.5);

  expect(context.sources[0]?.startedAt).toBe(12.5);
});

test('reports the audio clock, so nothing else has to hold a context to read it', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  context.currentTime = 4.25;

  expect(kit.now).toBe(4.25);
});

test('cancels hits that have not sounded yet and lets the ringing ones ring', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  context.currentTime = 1;
  kit.play('kick', 'plain', 0.9);
  kit.play('snare', 'plain', 1.4);

  kit.cancelPending();

  const [ringing, pending] = context.sources;
  expect(ringing?.stopped).toBe(false);
  expect(pending?.stopped).toBe(true);
});

test('forgets a hit once it has ended, so cancelling never reaches a spent node', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  kit.play('snare', 'plain', 5);
  context.sources[0]?.onended?.();
  context.currentTime = 1;

  kit.cancelPending();

  expect(context.sources[0]?.stopped).toBe(false);
});

test('wakes a suspended context once and leaves a running one alone', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);

  await kit.resume();
  await kit.resume();

  expect(context.resumeCount).toBe(1);
  expect(context.state).toBe('running');
});
