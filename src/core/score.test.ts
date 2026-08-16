import { describe, expect, it } from 'vitest';

import type { InstrumentId, Pattern } from './pattern.js';
import {
  BARS,
  STEPS_PER_BAR,
  STEPS_PER_BEAT,
  defaultPattern,
  emptyPattern,
  toggleStep,
  withArticulation,
} from './pattern.js';
import type { Duration, Entry, NoteEntry, ScoreVoice } from './score.js';
import { entrySteps, toScore } from './score.js';

function patternWith(hits: Partial<Record<InstrumentId, readonly number[]>>): Pattern {
  return Object.entries(hits).reduce(
    (pattern, [id, steps]) =>
      steps.reduce((next, step) => toggleStep(next, id as InstrumentId, step), pattern),
    emptyPattern(),
  );
}

function firstMeasureVoice(pattern: Pattern, id: 'hands' | 'feet'): ScoreVoice {
  const voice = toScore(pattern).measures[0]!.voices.find((candidate) => candidate.id === id);
  if (!voice) throw new Error(`no ${id} voice`);
  return voice;
}

function notesOf(voice: ScoreVoice): NoteEntry[] {
  return voice.entries.filter((entry): entry is NoteEntry => entry.kind === 'note');
}

/** Grooves to hold the whole-score invariants against. */
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
  // Grace notes steal no time, so this must spell as the plain groove does.
  ornamented: withArticulation(
    patternWith({ hihat: [0, 4, 8, 12], snare: [4, 12] }),
    'snare',
    4,
    'flam',
  ),
  // One bar silent, one not: whole rest and beat rule meet.
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
    // Low to high, as drawn.
    expect(notes[0]!.noteheads).toEqual([
      { position: 'c/5', type: 'normal', parenthesised: false },
      { position: 'g/5', type: 'cross', parenthesised: false },
    ]);
  });

  it('writes each instrument at its Percussive Arts Society position', () => {
    const pattern = patternWith({ hihat: [0], snare: [1], kick: [2] });
    const hands = notesOf(firstMeasureVoice(pattern, 'hands'));
    const feet = notesOf(firstMeasureVoice(pattern, 'feet'));

    expect(hands.map((note) => note.noteheads)).toEqual([
      [{ position: 'g/5', type: 'cross', parenthesised: false }], // hi-hat: above top line
      [{ position: 'c/5', type: 'normal', parenthesised: false }], // snare: 3rd space
    ]);
    expect(feet.map((note) => note.noteheads)).toEqual([
      [{ position: 'f/4', type: 'normal', parenthesised: false }], // kick: 1st space
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

    // Hands: 4th line. Feet: 1st space.
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

describe('accents', () => {
  it('leaves a plain stroke unaccented', () => {
    const notes = notesOf(firstMeasureVoice(patternWith({ snare: [4] }), 'hands'));

    expect(notes[0]!.accented).toBe(false);
  });

  it('accents the stroke an accented cell belongs to', () => {
    const pattern = withArticulation(emptyPattern(), 'snare', 4, 'accent');

    expect(notesOf(firstMeasureVoice(pattern, 'hands'))[0]!.accented).toBe(true);
  });

  it('accents a stroke once, however few of its heads asked for it', () => {
    // Struck together, one accented: one stroke, one stem, one mark — it belongs
    // to the stroke, not a head (ADR 0005).
    const pattern = withArticulation(patternWith({ hihat: [4], snare: [4] }), 'snare', 4, 'accent');

    const [stroke] = notesOf(firstMeasureVoice(pattern, 'hands'));
    expect(stroke!.noteheads).toHaveLength(2);
    expect(stroke!.accented).toBe(true);
  });

  it("keeps each voice's accents to itself", () => {
    const pattern = withArticulation(patternWith({ snare: [4] }), 'kick', 4, 'accent');

    expect(notesOf(firstMeasureVoice(pattern, 'hands'))[0]!.accented).toBe(false);
    expect(notesOf(firstMeasureVoice(pattern, 'feet'))[0]!.accented).toBe(true);
  });

  it('changes nothing about what the measure is worth', () => {
    const plain = patternWith({ hihat: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12] });
    const accented = withArticulation(plain, 'hihat', 4, 'accent');

    expect(spellAll(firstMeasureVoice(accented, 'hands').entries)).toBe(
      spellAll(firstMeasureVoice(plain, 'hands').entries),
    );
  });
});

describe('ghost notes', () => {
  it('leaves a plain head bare', () => {
    const notes = notesOf(firstMeasureVoice(patternWith({ snare: [4] }), 'hands'));

    expect(notes[0]!.noteheads).toEqual([
      { position: 'c/5', type: 'normal', parenthesised: false },
    ]);
  });

  it('parenthesises the head a ghosted cell is drawn as', () => {
    const pattern = withArticulation(emptyPattern(), 'snare', 4, 'ghost');

    expect(notesOf(firstMeasureVoice(pattern, 'hands'))[0]!.noteheads).toEqual([
      { position: 'c/5', type: 'normal', parenthesised: true },
    ]);
  });

  it('parenthesises only the ghosted head of a stroke, leaving the rest bare', () => {
    // Struck together, snare ghosted: unlike an accent the mark names its own
    // instrument, so the other head keeps nothing of it.
    const pattern = withArticulation(patternWith({ hihat: [4], snare: [4] }), 'snare', 4, 'ghost');

    const [stroke] = notesOf(firstMeasureVoice(pattern, 'hands'));
    expect(stroke!.noteheads).toEqual([
      { position: 'c/5', type: 'normal', parenthesised: true },
      { position: 'g/5', type: 'cross', parenthesised: false },
    ]);
    // Stroke untouched: a ghost is not a stem mark.
    expect(stroke!.accented).toBe(false);
  });

  it('changes nothing about what the measure is worth', () => {
    const plain = patternWith({ hihat: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12] });
    const ghosted = withArticulation(plain, 'snare', 4, 'ghost');

    expect(spellAll(firstMeasureVoice(ghosted, 'hands').entries)).toBe(
      spellAll(firstMeasureVoice(plain, 'hands').entries),
    );
  });
});

describe('grace notes', () => {
  it('leads a plain stroke with nothing', () => {
    const notes = notesOf(firstMeasureVoice(patternWith({ snare: [4] }), 'hands'));

    expect(notes[0]!.graces).toEqual([]);
  });

  it('leads a flammed stroke with one grace note', () => {
    const pattern = withArticulation(emptyPattern(), 'snare', 4, 'flam');

    expect(notesOf(firstMeasureVoice(pattern, 'hands'))[0]!.graces).toEqual([
      [{ position: 'c/5', type: 'normal', parenthesised: false }],
    ]);
  });

  it('leads a dragged stroke with two grace notes, on slots of their own', () => {
    const pattern = withArticulation(emptyPattern(), 'snare', 4, 'drag');

    // Two slots, not one chord of two: a lead apart, so they are drawn one after
    // the other, each on its own stem.
    expect(notesOf(firstMeasureVoice(pattern, 'hands'))[0]!.graces).toEqual([
      [{ position: 'c/5', type: 'normal', parenthesised: false }],
      [{ position: 'c/5', type: 'normal', parenthesised: false }],
    ]);
  });

  it("draws a grace note at its own instrument's position and notehead", () => {
    // Struck together, only the hi-hat flammed: the grace note is a cross above
    // the staff, and the snare leads nothing.
    const pattern = withArticulation(patternWith({ hihat: [4], snare: [4] }), 'hihat', 4, 'flam');

    const [stroke] = notesOf(firstMeasureVoice(pattern, 'hands'));
    expect(stroke!.graces).toEqual([[{ position: 'g/5', type: 'cross', parenthesised: false }]]);
    expect(stroke!.noteheads).toHaveLength(2);
  });

  it('gathers heads sounding the same distance ahead onto one slot', () => {
    // Flammed together: their grace hits share a moment, so one gesture — a
    // chord on one stem — not two implying a sequence nobody plays.
    const struck = patternWith({ hihat: [4], snare: [4] });
    const pattern = withArticulation(
      withArticulation(struck, 'hihat', 4, 'flam'),
      'snare',
      4,
      'flam',
    );

    expect(notesOf(firstMeasureVoice(pattern, 'hands'))[0]!.graces).toEqual([
      [
        { position: 'c/5', type: 'normal', parenthesised: false },
        { position: 'g/5', type: 'cross', parenthesised: false },
      ],
    ]);
  });

  it('lines a flam and a drag up on the slots they each sound on', () => {
    // Drag leads by two slots, flam by one: the drag's first grace hit is alone,
    // the second is the moment they share.
    const struck = patternWith({ hihat: [4], snare: [4] });
    const pattern = withArticulation(
      withArticulation(struck, 'hihat', 4, 'drag'),
      'snare',
      4,
      'flam',
    );

    expect(notesOf(firstMeasureVoice(pattern, 'hands'))[0]!.graces).toEqual([
      [{ position: 'g/5', type: 'cross', parenthesised: false }],
      [
        { position: 'c/5', type: 'normal', parenthesised: false },
        { position: 'g/5', type: 'cross', parenthesised: false },
      ],
    ]);
  });

  it('leads each voice with its own ornaments and nothing of the other', () => {
    const pattern = withArticulation(patternWith({ snare: [4] }), 'kick', 4, 'flam');

    expect(notesOf(firstMeasureVoice(pattern, 'hands'))[0]!.graces).toEqual([]);
    expect(notesOf(firstMeasureVoice(pattern, 'feet'))[0]!.graces).toEqual([
      [{ position: 'f/4', type: 'normal', parenthesised: false }],
    ]);
  });

  it('changes nothing about what the measure is worth', () => {
    const plain = patternWith({ hihat: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12] });

    for (const ornament of ['flam', 'drag'] as const) {
      const ornamented = withArticulation(plain, 'snare', 4, ornament);

      expect(spellAll(firstMeasureVoice(ornamented, 'hands').entries)).toBe(
        spellAll(firstMeasureVoice(plain, 'hands').entries),
      );
    }
  });
});

/** Entries as read: `16`, `8`, `8.`, `q`, `w`, `r` for a rest. Short enough
 *  that a beat's spelling fits one line of the tables below. */
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
   * All sixteen subsets of a beat's four steps and the spelling each must
   * produce — exhaustive by construction. Read off beat 1 of the hands voice;
   * the sentinel snare on the last step keeps the measure from being silent, so
   * the whole rest never stands in for a beat's answer.
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
    // A kick between two snares says nothing about the snare's length.
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
            // Nothing outlasts its beat, so nothing reaches a barline —
            // except the whole rest of an entirely empty measure.
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

describe('beaming', () => {
  /**
   * The same sixteen subsets read the other way: the groups each must produce.
   * Indices into the voice's entries; beat 1 starts at 0, so they read as
   * positions within the beat. The sentinel lands on beat 4's last sixteenth,
   * written `8.r 16` — a lone sixteenth, never a group — so everything below is
   * beat 1's doing.
   */
  const SENTINEL = STEPS_PER_BAR - 1;
  const beamCases: readonly (readonly [
    hits: readonly number[],
    spelling: string,
    groups: readonly (readonly number[])[],
  ])[] = [
    [[], 'qr', []], //                     nothing to beam
    [[0], 'q', []], //                     a quarter has no flag
    [[1], '16r 8.', []], //                one flagged note is no group
    [[2], '8r 8', []],
    [[3], '8.r 16', []],
    [[0, 1], '16 8.', [[0, 1]]],
    [[0, 2], '8 8', [[0, 1]]],
    [[0, 3], '8. 16', [[0, 1]]],
    [[1, 2], '16r 16 8', [[1, 2]]], //     leading rest stays outside
    [[1, 3], '16r 8 16', [[1, 2]]],
    [[2, 3], '8r 16 16', [[1, 2]]],
    [[0, 1, 2], '16 16 8', [[0, 1, 2]]],
    [[0, 1, 3], '16 8 16', [[0, 1, 2]]],
    [[0, 2, 3], '8 16 16', [[0, 1, 2]]],
    [[1, 2, 3], '16r 16 16 16', [[1, 2, 3]]],
    [[0, 1, 2, 3], '16 16 16 16', [[0, 1, 2, 3]]],
  ];

  it.each(beamCases)('beams a beat holding %j, written %s, as %j', (hits, _spelling, groups) => {
    const voice = firstMeasureVoice(patternWith({ snare: [...hits, SENTINEL] }), 'hands');

    expect(voice.beamGroups).toEqual(groups);
  });

  it('beams each beat of a straight sixteenth line on its own', () => {
    const hihat = [...Array(STEPS_PER_BAR).keys()];
    const voice = firstMeasureVoice(patternWith({ hihat }), 'hands');

    expect(voice.beamGroups).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
      [12, 13, 14, 15],
    ]);
  });

  /** Every group of every voice of every measure, with its origin. */
  function allGroups(): { where: string; voice: ScoreVoice; group: readonly number[] }[] {
    return Object.entries(SAMPLE_PATTERNS).flatMap(([name, pattern]) =>
      toScore(pattern).measures.flatMap((measure) =>
        measure.voices.flatMap((voice) =>
          voice.beamGroups.map((group) => ({
            where: `${name}/${measure.index}/${voice.id}`,
            voice,
            group,
          })),
        ),
      ),
    );
  }

  /** All a beam can join: flagged notes, dotted or not. */
  const BEAMABLE_SPELLINGS = ['16', '8', '8.'];

  it('joins nothing but flagged notes — never a rest, never a quarter', () => {
    const spelled = new Set(
      allGroups().flatMap(({ voice, group }) => group.map((index) => spell(voice.entries[index]!))),
    );

    expect([...spelled].sort()).toEqual([...BEAMABLE_SPELLINGS].sort());
  });

  it('keeps every group inside a single beat, in order, at most one per beat', () => {
    for (const { where, voice, group } of allGroups()) {
      const beats = group.map((index) =>
        Math.floor(voice.entries[index]!.startStep / STEPS_PER_BEAT),
      );

      // One beat per group, so no beam crosses a beat — nor, since beats tile
      // the measure, a barline.
      expect(`${where}: ${beats.join(',')}`).toBe(
        `${where}: ${beats.map(() => beats[0]).join(',')}`,
      );
      expect(`${where}: ${group.join(',')}`).toBe(
        `${where}: ${[...new Set(group)].sort((a, b) => a - b).join(',')}`,
      );
      expect(`${where}: ${group.length > 1}`).toBe(`${where}: true`);
    }

    for (const [name, pattern] of Object.entries(SAMPLE_PATTERNS)) {
      for (const measure of toScore(pattern).measures) {
        for (const voice of measure.voices) {
          const where = `${name}/${measure.index}/${voice.id}`;
          const beats = voice.beamGroups.map((group) =>
            Math.floor(voice.entries[group[0]!]!.startStep / STEPS_PER_BEAT),
          );

          expect(`${where}: ${beats.join(',')}`).toBe(`${where}: ${[...new Set(beats)].join(',')}`);
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
