/**
 * The second press an act with nothing behind it costs. One instance per
 * control, armed by the subject it is about, so the four questions in the app
 * are one behaviour rather than four that match.
 *
 * Nothing here knows what is being asked about: the act is handed in, and so is
 * the warrant for asking at all. No DOM either — a question is state, and the
 * control it lives in is the component's business.
 */

/** How long a question stands before it takes itself back. */
const WAIT_MS = 5000;

/** The subject of a control acting on nothing narrower than the whole grid, so
 *  that one shape serves the keyed questions and the unkeyed alike. */
export const ABOUT_NOTHING = '';

/** What a control reports as `data-state`, so a stylesheet or a test need not
 *  read the label. */
export function stateOf(asking: boolean): 'asking' | 'idle' {
  return asking ? 'asking' : 'idle';
}

/** The accessible name a standing question says, built from the phrase naming
 *  the act — `Delete Bossa`, `Clear the pattern`. */
export function askingName(phrase: string): string {
  return `${phrase}? Press again to confirm`;
}

export class Question {
  /** The subject asked about, else nothing standing. Rune-backed: markup reads
   *  it, so it has to re-render when the answer changes. */
  #asked = $state<string | null>(null);
  #withdrawal: ReturnType<typeof setTimeout> | undefined;

  /**
   * Asks where the act is worth asking about and the question is not already
   * standing about this subject; otherwise the answer has come, so the act
   * runs. The whole of the two-press rule.
   */
  press(subject: string, warranted: boolean, act: () => void): void {
    if (warranted && !this.asking(subject)) {
      this.#asked = subject;
      clearTimeout(this.#withdrawal);
      this.#withdrawal = setTimeout(() => this.withdraw(), WAIT_MS);
      return;
    }
    this.withdraw();
    act();
  }

  /**
   * Whether the question stands about *this* subject — answered against what is
   * handed in rather than a remembered flag, so a subject that has moved on
   * under the question takes it back on its own. Two subjects differing only in
   * case are one subject, as two names are one name.
   */
  asking(subject: string): boolean {
    return this.#asked !== null && this.#asked.toLowerCase() === subject.toLowerCase();
  }

  /** Takes the question back. Wired to blur everywhere: attention elsewhere is
   *  an answer of sorts. */
  withdraw(): void {
    this.#asked = null;
    clearTimeout(this.#withdrawal);
  }
}
