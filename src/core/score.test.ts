import { describe, expect, it } from 'vitest';

import type { InstrumentId, Pattern } from './pattern.js';
import { BARS, STEPS_PER_BAR, defaultPattern, emptyPattern, toggleStep } from './pattern.js';
import type { Entry, NoteEntry, ScoreVoice } from './score.js';
import { entrySteps, toScore } from './score.js';

/** A pattern built from bar-relative hits in the first bar, for readable cases. */
function patternWith(hits: Partial<Record<InstrumentId, readonly number[]>>): Pattern {
  return Object.entries(hits).reduce(
    (pattern, [id, steps]) =>
      steps.reduce((next, step) => toggleStep(next, id as InstrumentId, step), pattern),
    emptyPattern(),
  );
}

/** The first measure's voice, by id. */
function firstMeasureVoice(pattern: Pattern, id: 'hands' | 'feet'): ScoreVoice {
  const voice = toScore(pattern).measures[0]!.voices.find((candidate) => candidate.id === id);
  if (!voice) throw new Error(`no ${id} voice`);
  return voice;
}

function notesOf(voice: ScoreVoice): NoteEntry[] {
  return voice.entries.filter((entry): entry is NoteEntry => entry.kind === 'note');
}

describe('toScore', () => {
  it('writes one measure per bar, each carrying a hands and a feet voice', () => {
    const score = toScore(emptyPattern());

    expect(score.measures).toHaveLength(BARS);
    expect(score.measures.map((measure) => measure.index)).toEqual([...Array(BARS).keys()]);
    for (const measure of score.measures) {
      expect(measure.voices.map((voice) => voice.id)).toEqual(['hands', 'feet']);
    }
  });

  it('fills a silent measure with rests, one per step in this naive phase', () => {
    const [measure] = toScore(emptyPattern()).measures;

    for (const voice of measure!.voices) {
      expect(voice.entries).toHaveLength(STEPS_PER_BAR);
      expect(voice.entries.every((entry) => entry.kind === 'rest')).toBe(true);
    }
  });

  it('merges simultaneous hits in one voice into a single chord on one stem', () => {
    const voice = firstMeasureVoice(patternWith({ hihat: [0], snare: [0] }), 'hands');
    const notes = notesOf(voice);

    expect(notes).toHaveLength(1);
    // Low to high, so the chord reads the way it is drawn.
    expect(notes[0]!.noteheads).toEqual([
      { position: 'c/5', type: 'normal' },
      { position: 'g/5', type: 'cross' },
    ]);
  });

  it('writes each instrument at its Percussive Arts Society position', () => {
    const pattern = patternWith({ hihat: [0], snare: [1], kick: [2] });
    const hands = notesOf(firstMeasureVoice(pattern, 'hands'));
    const feet = notesOf(firstMeasureVoice(pattern, 'feet'));

    expect(hands.map((note) => note.noteheads)).toEqual([
      [{ position: 'g/5', type: 'cross' }], // hi-hat: X above the top line
      [{ position: 'c/5', type: 'normal' }], // snare: third space
    ]);
    expect(feet.map((note) => note.noteheads)).toEqual([
      [{ position: 'f/4', type: 'normal' }], // kick: first space
    ]);
  });

  it('stems the hands up and the feet down', () => {
    const pattern = defaultPattern();

    expect(firstMeasureVoice(pattern, 'hands').stem).toBe('up');
    expect(firstMeasureVoice(pattern, 'feet').stem).toBe('down');
  });

  it('rests each voice at its own height', () => {
    const measure = toScore(emptyPattern()).measures[0]!;
    const positions = measure.voices.map((voice) =>
      voice.entries.map((entry) => (entry.kind === 'rest' ? entry.position : null)),
    );

    // Hands on the fourth line, feet in the first space.
    expect(new Set(positions[0])).toEqual(new Set(['d/5']));
    expect(new Set(positions[1])).toEqual(new Set(['f/4']));
  });

  it('keeps a hit out of the other voice entirely', () => {
    const kickOnly = firstMeasureVoice(patternWith({ kick: [0, 4] }), 'hands');
    const handsOnly = firstMeasureVoice(patternWith({ snare: [0], hihat: [4] }), 'feet');

    expect(kickOnly.entries.every((entry) => entry.kind === 'rest')).toBe(true);
    expect(handsOnly.entries.every((entry) => entry.kind === 'rest')).toBe(true);
  });

  it('fills every voice of every measure with exactly one measure of steps', () => {
    const patterns: Record<string, Pattern> = {
      empty: emptyPattern(),
      rock: defaultPattern(),
      downbeatOnly: patternWith({ kick: [0] }),
      dense: patternWith({
        hihat: [...Array(STEPS_PER_BAR).keys()],
        snare: [4, 12],
        kick: [0, 3, 10],
      }),
      offbeats: patternWith({ hihat: [1, 5, 9, 13], kick: [15] }),
    };

    for (const [name, pattern] of Object.entries(patterns)) {
      for (const measure of toScore(pattern).measures) {
        for (const voice of measure.voices) {
          const total = voice.entries.reduce((sum, entry) => sum + entrySteps(entry), 0);
          expect(`${name}/${measure.index}/${voice.id}: ${total}`).toBe(
            `${name}/${measure.index}/${voice.id}: ${STEPS_PER_BAR}`,
          );
        }
      }
    }
  });

  it('numbers every entry with its absolute step, in order, within its own measure', () => {
    for (const measure of toScore(defaultPattern()).measures) {
      for (const voice of measure.voices) {
        const starts = voice.entries.map((entry: Entry) => entry.startStep);

        expect(starts[0]).toBe(measure.index * STEPS_PER_BAR);
        expect([...starts].sort((a, b) => a - b)).toEqual(starts);
        expect(starts.at(-1)).toBeLessThan((measure.index + 1) * STEPS_PER_BAR);
      }
    }
  });

  it('reads every bar of the pattern, not only the first', () => {
    const pattern = toggleStep(emptyPattern(), 'snare', STEPS_PER_BAR + 2);
    const lastMeasure = toScore(pattern).measures[BARS - 1]!;
    const hands = lastMeasure.voices.find((voice) => voice.id === 'hands')!;

    expect(notesOf(hands).map((note) => note.startStep)).toEqual([STEPS_PER_BAR + 2]);
  });
});

describe('entrySteps', () => {
  it('measures each undotted value against the beat', () => {
    const rest = { kind: 'rest', startStep: 0, dots: 0, position: 'd/5' } as const;

    expect(entrySteps({ ...rest, duration: 'sixteenth' })).toBe(1);
    expect(entrySteps({ ...rest, duration: 'eighth' })).toBe(2);
    expect(entrySteps({ ...rest, duration: 'quarter' })).toBe(4);
    expect(entrySteps({ ...rest, duration: 'whole' })).toBe(STEPS_PER_BAR);
  });

  it('adds half again for a dot', () => {
    const rest = { kind: 'rest', startStep: 0, position: 'd/5' } as const;

    expect(entrySteps({ ...rest, duration: 'eighth', dots: 1 })).toBe(3);
    expect(entrySteps({ ...rest, duration: 'quarter', dots: 1 })).toBe(6);
  });
});
