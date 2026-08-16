<script lang="ts">
  import type { Articulation, InstrumentId } from '../core/pattern.js';
  import {
    INSTRUMENTS,
    STEPS_PER_BAR,
    articulationAt,
    choiceOf,
    gridBars,
    isWritten,
  } from '../core/pattern.js';
  import { auditionOf } from '../core/schedule.js';
  import { audioState } from '../state/audio.svelte.js';
  import { patternState } from '../state/pattern.svelte.js';
  import { transportState } from '../state/transport.svelte.js';
  import CellMenu from './CellMenu.svelte';

  const bars = gridBars();

  /** Press duration that makes a hold rather than a tap. */
  const HOLD_MS = 500;
  /** Pointer drift that makes the press a scroll or drag. */
  const DRIFT_PX = 10;

  /** Which cell the open menu belongs to, and its anchor. */
  interface OpenMenu {
    readonly instrument: InstrumentId;
    readonly step: number;
    readonly cell: HTMLButtonElement;
  }

  let menu = $state<OpenMenu | undefined>(undefined);

  let hold: ReturnType<typeof setTimeout> | undefined;
  let origin: { x: number; y: number } | undefined;
  /** A press that opened or dismissed a menu is not also a tap. */
  let swallowClick = false;

  function isOpen(instrument: InstrumentId, step: number): boolean {
    return menu?.instrument === instrument && menu.step === step;
  }

  /** Name for the cell and the menu acting on it, including what it holds — the
   *  only way a reader learns a cell is accented, not merely written. */
  function cellName(instrument: InstrumentId, step: number): string {
    const { name } = INSTRUMENTS.find(({ id }) => id === instrument) ?? { name: instrument };
    const articulation = articulationAt(patternState.current, instrument, step);
    return `${name}, step ${step + 1}, ${choiceOf(articulation)?.name ?? articulation}`;
  }

  /** The cell's mark, if it has one. Page font, so a cell is drawn the moment
   *  it is written — nothing waits on the staff's notation font. */
  function cellMark(instrument: InstrumentId, step: number): string {
    return choiceOf(articulationAt(patternState.current, instrument, step))?.mark ?? '';
  }

  function open(cell: HTMLButtonElement, instrument: InstrumentId, step: number): void {
    abandonHold();
    menu = { instrument, step, cell };
  }

  /** Every way out of the menu, so focus lands back on the opening cell. */
  function close(): void {
    const opener = menu?.cell;
    menu = undefined;
    if (opener === undefined) return;

    opener.focus();
    // A dismissing press moves focus itself after this returns. Take it back
    // only if it landed nowhere — a press on another control is deliberate.
    setTimeout(() => {
      if (document.activeElement === document.body) opener.focus();
    });
  }

  // What a cell sounds like when written. The core says which hits, at which
  // rung, how far apart — a flam auditions as a flam. `empty` makes none, so
  // rubbing out is silent with no special case here.
  function audition(instrument: InstrumentId, articulation: Articulation): void {
    for (const { dynamic, delay } of auditionOf(articulation, patternState.current.tempo)) {
      audioState.audition(instrument, dynamic, delay);
    }
  }

  function choose(articulation: Articulation): void {
    const chosen = menu;
    close();
    if (chosen === undefined) return;
    audition(chosen.instrument, patternState.write(chosen.instrument, chosen.step, articulation));
  }

  function pressStart(event: PointerEvent, instrument: InstrumentId, step: number): void {
    // A press with the menu open only dismisses it; that's the menu's business.
    swallowClick = menu !== undefined;
    // Secondary buttons raise their own contextmenu; only primary holds.
    if (event.button !== 0) return;

    const cell = event.currentTarget as HTMLButtonElement;
    abandonHold();
    origin = { x: event.clientX, y: event.clientY };
    hold = setTimeout(() => {
      swallowClick = true;
      open(cell, instrument, step);
    }, HOLD_MS);
  }

  // A travelling finger is scrolling or dragging, not holding — and the browser
  // may take the gesture entirely, arriving as a cancelled pointer.
  function pressMove(event: PointerEvent): void {
    if (origin === undefined) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > DRIFT_PX) abandonHold();
  }

  function abandonHold(): void {
    clearTimeout(hold);
    hold = undefined;
    origin = undefined;
  }

  // Writing a hit plays it, rubbing out is silent. Every cell makes sound, so
  // the grid waits for samples rather than letting a tap land mutely.
  function tap(instrument: InstrumentId, step: number): void {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    audition(instrument, patternState.toggle(instrument, step));
  }

  // Right-click, Menu key and Shift+F10 all arrive here.
  function contextMenu(event: MouseEvent, instrument: InstrumentId, step: number): void {
    event.preventDefault();
    open(event.currentTarget as HTMLButtonElement, instrument, step);
  }
</script>

<div class="grid">
  {#each bars as bar (bar.index)}
    <section class="bar" style:--steps={STEPS_PER_BAR} aria-label="Bar {bar.index + 1}">
      <span class="corner" aria-hidden="true"></span>
      {#each bar.steps as step (step.index)}
        <span
          class="count"
          class:beat={step.isBeatStart}
          class:playing={transportState.playhead === step.index}
          aria-hidden="true">{step.label}</span
        >
      {/each}

      {#each INSTRUMENTS as instrument (instrument.id)}
        <!-- Abbreviated to spare the cells width; full name on hover, and it
             names every cell in the row. -->
        <span class="name" title={instrument.name}>{instrument.abbreviation}</span>
        {#each bar.steps as step (step.index)}
          <button
            type="button"
            class="cell"
            class:beat={step.isBeatStart}
            class:playing={transportState.playhead === step.index}
            aria-pressed={isWritten(patternState.current, instrument.id, step.index)}
            aria-label={cellName(instrument.id, step.index)}
            aria-haspopup="menu"
            aria-expanded={isOpen(instrument.id, step.index)}
            data-instrument={instrument.id}
            data-step={step.index}
            data-articulation={articulationAt(patternState.current, instrument.id, step.index)}
            disabled={!audioState.ready}
            onclick={() => tap(instrument.id, step.index)}
            onpointerdown={(event) => pressStart(event, instrument.id, step.index)}
            onpointermove={pressMove}
            onpointerup={abandonHold}
            onpointercancel={abandonHold}
            onpointerleave={abandonHold}
            oncontextmenu={(event) => contextMenu(event, instrument.id, step.index)}
            ><span class="mark" aria-hidden="true">{cellMark(instrument.id, step.index)}</span
            ></button
          >
        {/each}
      {/each}
    </section>
  {/each}
</div>

{#if menu}
  <CellMenu
    anchor={menu.cell}
    current={articulationAt(patternState.current, menu.instrument, menu.step)}
    label="Articulation for {cellName(menu.instrument, menu.step)}"
    onchoose={choose}
    onclose={close}
  />
{/if}

<style>
  /* Side by side when two fit at a legible cell size, else stacked — breakpoint
     from this grid's content, not a shared constant. `min(..., 100%)` keeps one
     bar from overflowing a narrow phone. */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(23rem, 100%), 1fr));
    gap: 1.5rem;
    /* Queried below, so a bar can tell which of the two it got. */
    container-type: inline-size;
  }

  .bar {
    display: grid;
    grid-template-columns: auto repeat(var(--steps), 1fr);
    /* Hairline: gap is width off the cells, and their borders already separate. */
    gap: 1px;
    align-items: center;
  }

  .count {
    font-size: 0.75rem;
    text-align: center;
    color: #6b7280;
  }

  .count.beat {
    font-weight: 700;
    color: #111827;
  }

  .name {
    padding-right: 0.5rem;
    font-size: 0.8125rem;
    text-align: right;
    white-space: nowrap;
  }

  /* Side by side, one set of labels names every bar's rows, so the repeat is
     noise and the cells take the width back. The leading column goes with them,
     keeping counts over their own cells. 47.5rem is where auto-fit above fits a
     second 23rem bar past the 1.5rem gap: the numbers move together. */
  @container (min-width: 47.5rem) {
    .bar:not(:first-of-type) {
      grid-template-columns: repeat(var(--steps), 1fr);
    }

    .bar:not(:first-of-type) .corner,
    .bar:not(:first-of-type) .name {
      display: none;
    }
  }

  /* Square wherever the step column is narrower than the comfortable height —
     on a phone, everywhere: squares read as a grid, thin slots as bars. Capped,
     not fixed, so a wide screen keeps a short row instead of huge squares. */
  .cell {
    min-width: 0;
    aspect-ratio: 1;
    max-height: 2rem;
    /* Buttons default to the platform font; the marks below are the page's. */
    font: inherit;
    /* Lets the mark size off the cell, keeping it proportionate phone to desktop. */
    container-type: size;
    padding: 0;
    border: 1px solid #d1d5db;
    border-radius: 3px;
    background: #f9fafb;
    cursor: pointer;
    /* A hold is this app's gesture; without these, touch answers first with a
       callout and a selection. `manipulation` still allows scrolling from a cell. */
    touch-action: manipulation;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  /* Beat boundaries: 1, 2, 3, 4 at a glance. */
  .cell.beat {
    border-left: 3px solid #9ca3af;
    background: #eef2f7;
  }

  /* Lights the column. Above the filled-cell rule on purpose: a written hit
     keeps its colour, and the ring marks filled and empty cells alike. */
  .cell.playing {
    background: #fef3c7;
    box-shadow: inset 0 0 0 2px #f59e0b;
  }

  .count.playing {
    color: #b45309;
    font-weight: 700;
  }

  .cell[aria-pressed='true'] {
    border-color: #1d4ed8;
    background: #2563eb;
  }

  /* The articulation, in page characters sized off the cell, so it shrinks with
     the square on a phone. Bold, since a plain character lacks an engraved
     glyph's weight. White on the fill, the only ground it sits on — the playhead
     lights empty cells, never marked ones. */
  .mark {
    display: grid;
    place-items: center;
    font-size: 80cqh;
    font-weight: 700;
    line-height: 0;
    color: #fff;
    pointer-events: none;
  }

  /* A pair where every other mark is one character: set smaller to fit. */
  .cell[data-articulation='ghost'] .mark {
    font-size: 50cqh;
  }

  /* A letter's ink sits high in its em box (the descender space is empty), so
     nudge it down to the cell's middle. `>` and the parens already centre. */
  .cell[data-articulation='flam'] .mark,
  .cell[data-articulation='drag'] .mark {
    padding-top: 0.06em;
  }

  /* Samples still decoding: readable, not yet playable. */
  .cell:disabled {
    cursor: progress;
    opacity: 0.55;
  }
</style>
