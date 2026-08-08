import { describe, expect, it } from 'vitest';

import type { InstrumentId, Pattern } from './pattern.js';
import {
  BARS,
  STEPS_PER_BAR,
  STEPS_PER_BEAT,
  defaultPattern,
  emptyPattern,
  toggleStep,
} from './pattern.js';
import type { Duration, Entry, NoteEntry, ScoreVoice } from './score.js';
import { entrySteps, toScore } from './score.js';

/** A pattern built from absolute step indices, for readable cases. */
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

/** A spread of grooves to hold the whole-score invariants against. */
const SAMPLE_PATTERNS: Record<string, Pattern> = {
  empty: emptyPattern(),
  rock: defaultPattern(),
  downbeatOnly: patternWith({ kick: [0] }),
  dense: patternWith({
    hihat: [...Array(STEPS_PER_BAR).keys()],
    snare: [4, 12],
    kick: [0, 3, 10],
  }),
  offbeats: patternWith({ hihat: [1, 5, 9, 13], kick: [15] }),
  // One bar silent and the other not, so the whole rest and the beat rule meet.
  secondBarOnly: patternWith({ snare: [STEPS_PER_BAR + 5], kick: [STEPS_PER_BAR + 12] }),
};

describe('toScore', () => {
  it('writes one measure per bar, each carrying a hands and a feet voice', () => {
    const score = toScore(emptyPattern());

    expect(score.measures).toHaveLength(BARS);
    expect(score.measures.map((measure) => measure.index)).toEqual([...Array(BARS).keys()]);
    for (const measure of score.measures) {
      expect(measure.voices.map((voice) => voice.id)).toEqual(['hands', 'feet']);
    }
  });

  it('writes a voice that never plays in a measure as a single whole rest', () => {
    for (const measure of toScore(emptyPattern()).measures) {
      for (const voice of measure.voices) {
        expect(voice.entries).toEqual([
          {
            kind: 'rest',
            startStep: measure.index * STEPS_PER_BAR,
            duration: 'whole',
            dots: 0,
            position: voice.id === 'hands' ? 'd/5' : 'f/4',
          },
        ]);
      }
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
    for (const [name, pattern] of Object.entries(SAMPLE_PATTERNS)) {
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

/**
 * Every entry spelled the way a reader says it: `16`, `8`, `8.`, `q`, `w`, with
 * an `r` for a rest. Short enough that a whole beat's spelling fits on one line
 * of a case table, which is what makes the table below readable.
 */
const SPELLINGS: Record<Duration, string> = {
  whole: 'w',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
};

function spell(entry: Entry): string {
  return SPELLINGS[entry.duration] + '.'.repeat(entry.dots) + (entry.kind === 'rest' ? 'r' : '');
}

function spellAll(entries: readonly Entry[]): string {
  return entries.map(spell).join(' ');
}

describe('durations', () => {
  /**
   * Every shape a single beat can take — all sixteen subsets of its four steps —
   * with the spelling each one has to produce. Exhaustive by construction: if a
   * beat can be written wrongly at all, one of these rows says so.
   *
   * The cases are read off beat 1 of the hands voice. A sentinel snare on the
   * last step of the measure keeps the measure from being silent, so the
   * whole-rest spelling never stands in for a beat's own answer.
   */
  const SENTINEL = STEPS_PER_BAR - 1;
  const beatCases: readonly (readonly [hits: readonly number[], spelling: string])[] = [
    [[], 'qr'],
    [[0], 'q'],
    [[1], '16r 8.'],
    [[2], '8r 8'],
    [[3], '8.r 16'],
    [[0, 1], '16 8.'],
    [[0, 2], '8 8'],
    [[0, 3], '8. 16'],
    [[1, 2], '16r 16 8'],
    [[1, 3], '16r 8 16'],
    [[2, 3], '8r 16 16'],
    [[0, 1, 2], '16 16 8'],
    [[0, 1, 3], '16 8 16'],
    [[0, 2, 3], '8 16 16'],
    [[1, 2, 3], '16r 16 16 16'],
    [[0, 1, 2, 3], '16 16 16 16'],
  ];

  it.each(beatCases)('spells a beat holding %j as %s', (hits, spelling) => {
    const voice = firstMeasureVoice(patternWith({ snare: [...hits, SENTINEL] }), 'hands');
    const beat = voice.entries.filter((entry) => entry.startStep < STEPS_PER_BEAT);

    expect(spellAll(beat)).toBe(spelling);
  });

  it('reaches no note value outside a sixteenth, eighth, dotted eighth or quarter', () => {
    const spellings = new Set(
      beatCases.flatMap(([hits]) =>
        firstMeasureVoice(patternWith({ snare: [...hits, SENTINEL] }), 'hands')
          .entries.filter((entry) => entry.startStep < STEPS_PER_BEAT)
          .map((entry) => SPELLINGS[entry.duration] + '.'.repeat(entry.dots)),
      ),
    );

    expect([...spellings].sort()).toEqual(['16', '8', '8.', 'q']);
  });

  it('caps a note by the gap in its own voice, not by what the other voice plays', () => {
    // A kick between two snares says nothing about how long the snare before it
    // is held: the hands read the same with it and without it.
    const withKick = patternWith({ snare: [0, STEPS_PER_BEAT], kick: [2] });
    const withoutKick = patternWith({ snare: [0, STEPS_PER_BEAT] });

    expect(spellAll(firstMeasureVoice(withKick, 'hands').entries)).toBe('q q qr qr');
    expect(spellAll(firstMeasureVoice(withoutKick, 'hands').entries)).toBe('q q qr qr');
  });

  it('keeps every entry inside the beat it starts on, contiguously', () => {
    for (const [name, pattern] of Object.entries(SAMPLE_PATTERNS)) {
      for (const measure of toScore(pattern).measures) {
        for (const voice of measure.voices) {
          const where = `${name}/${measure.index}/${voice.id}`;
          let step = measure.index * STEPS_PER_BAR;

          for (const entry of voice.entries) {
            expect(`${where}: ${entry.startStep}`).toBe(`${where}: ${step}`);
            step += entrySteps(entry);
            // Nothing outlasts the beat it starts on, so nothing can reach a
            // barline either. The whole rest is the one exception: it stands
            // for a measure with nothing in it at all.
            if (entry.duration !== 'whole') {
              const beatEnd = (Math.floor(entry.startStep / STEPS_PER_BEAT) + 1) * STEPS_PER_BEAT;
              expect(`${where}: ${step}`).toBe(`${where}: ${Math.min(step, beatEnd)}`);
            }
          }

          expect(`${where}: ${step}`).toBe(`${where}: ${(measure.index + 1) * STEPS_PER_BAR}`);
        }
      }
    }
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
