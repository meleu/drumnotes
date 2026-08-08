import { expect, test } from 'vitest';

import { INSTRUMENTS } from '../core/pattern.js';
import { createDrumKit } from './audio.js';

/**
 * Enough of the Web Audio API to exercise the kit in a node test. The real
 * `AudioContext` satisfies the same shape; the casts are the seam between a
 * browser type and a stand-in for it.
 */
class FakeSource {
  buffer: AudioBuffer | null = null;
  connectedTo: unknown = null;
  startedAt: number | undefined = undefined;

  connect(destination: unknown): void {
    this.connectedTo = destination;
  }

  start(when?: number): void {
    this.startedAt = when;
  }
}

class FakeContext {
  state: AudioContextState = 'suspended';
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

const SOURCES = {
  hihat: '/samples/hihat.wav',
  snare: '/samples/snare.wav',
  kick: '/samples/kick.wav',
};

test('decodes every sample exactly once', async () => {
  const context = new FakeContext();

  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  expect(context.fetched.toSorted()).toEqual(Object.values(SOURCES).toSorted());
  expect(context.decoded).toHaveLength(INSTRUMENTS.length);
});

test('reuses one decoded buffer across hits, through a fresh source node each time', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  kit.play('snare');
  kit.play('snare');

  expect(context.decoded).toHaveLength(INSTRUMENTS.length);
  expect(context.sources).toHaveLength(2);
  const [first, second] = context.sources;
  expect(first).not.toBe(second);
  expect(first?.buffer).toBe(second?.buffer);
});

test('starts the hit at once rather than at a scheduled time', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);
  await kit.ready;

  kit.play('kick');

  expect(context.sources[0]?.startedAt).toBeUndefined();
  expect(context.sources[0]?.connectedTo).toBe(context.destination);
});

test('stays silent when asked for an instrument that has not decoded yet', () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);

  kit.play('hihat');

  expect(context.sources).toHaveLength(0);
});

test('wakes a suspended context once and leaves a running one alone', async () => {
  const context = new FakeContext();
  const kit = createDrumKit(context.asContext(), SOURCES, context.fetchSample);

  await kit.resume();
  await kit.resume();

  expect(context.resumeCount).toBe(1);
  expect(context.state).toBe('running');
});
