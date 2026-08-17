import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Question } from './question.svelte.js';

/** An act whose running is not what the test is about. */
function noop(): void {}

/**
 * Fake milliseconds a standing question takes to withdraw itself. Measured
 * rather than written down, so the wait stays spelled in one place — and so the
 * two waits a re-arming compares are the same measurement.
 */
function waitedOut(question: Question, subject: string): number {
  let waited = 0;
  while (question.asking(subject)) {
    vi.advanceTimersByTime(1);
    waited += 1;
  }
  return waited;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('press', () => {
  it('asks rather than acting, the first time', () => {
    const question = new Question();
    let acted = false;

    question.press('Bossa', true, () => (acted = true));

    expect(acted).toBe(false);
    expect(question.asking('Bossa')).toBe(true);
  });

  it('acts on the press that answers, and leaves nothing standing', () => {
    const question = new Question();
    let acted = false;

    question.press('Bossa', true, noop);
    question.press('Bossa', true, () => (acted = true));

    expect(acted).toBe(true);
    expect(question.asking('Bossa')).toBe(false);
  });

  it('acts at once where there is nothing to ask about', () => {
    const question = new Question();
    let acted = false;

    question.press('Bossa', false, () => (acted = true));

    expect(acted).toBe(true);
    expect(question.asking('Bossa')).toBe(false);
  });

  it('takes the first question back when a second subject is asked about', () => {
    const question = new Question();
    let acted = false;

    question.press('Bossa', true, noop);
    question.press('Funk', true, () => (acted = true));

    expect(acted).toBe(false);
    expect(question.asking('Bossa')).toBe(false);
    expect(question.asking('Funk')).toBe(true);
  });
});

describe('asking about', () => {
  it('stands about the subject asked about and no other', () => {
    const question = new Question();

    question.press('Bossa', true, noop);

    expect(question.asking('Funk')).toBe(false);
  });

  it('reads two subjects differing only in case as one subject', () => {
    const question = new Question();
    let acted = false;

    question.press('Bossa', true, noop);

    expect(question.asking('bossa')).toBe(true);

    question.press('bossa', true, () => (acted = true));

    expect(acted).toBe(true);
  });
});

describe('withdraw', () => {
  it('takes a standing question back on demand', () => {
    const question = new Question();

    question.press('Bossa', true, noop);
    question.withdraw();

    expect(question.asking('Bossa')).toBe(false);
  });

  it('takes a question back once the wait elapses', () => {
    const question = new Question();

    question.press('Bossa', true, noop);
    vi.runAllTimers();

    expect(question.asking('Bossa')).toBe(false);
  });

  it('gives a re-armed question the whole wait again', () => {
    const measured = new Question();
    measured.press('Bossa', true, noop);
    const wait = waitedOut(measured, 'Bossa');

    const question = new Question();
    question.press('Bossa', true, noop);
    vi.advanceTimersByTime(wait - 1);
    question.press('Funk', true, noop);

    expect(waitedOut(question, 'Funk')).toBe(wait);
  });
});
