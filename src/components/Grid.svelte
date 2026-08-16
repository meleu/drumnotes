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

  /** How long a press has to last before it is a hold rather than a tap. */
  const HOLD_MS = 500;
  /** How far the pointer may wander before the press is a scroll or a drag. */
  const DRIFT_PX = 10;

  /** Which cell the one open menu belongs to, and what it is anchored to. */
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

  /** What a cell is called, to the cell itself and to the menu acting on it —
   *  including what it holds, which is the only way a reader learns that a cell
   *  is accented rather than merely written. */
  function cellName(instrument: InstrumentId, step: number): string {
    const { name } = INSTRUMENTS.find(({ id }) => id === instrument) ?? { name: instrument };
    const articulation = articulationAt(patternState.current, instrument, step);
    return `${name}, step ${step + 1}, ${choiceOf(articulation)?.name ?? articulation}`;
  }

  /** The mark a cell wears, if what it holds has one to wear. Plain characters
   *  in the page's own font, so a cell is drawn the moment it is written —
   *  nothing here waits on the notation font the staff is loading. */
  function cellMark(instrument: InstrumentId, step: number): string {
    return choiceOf(articulationAt(patternState.current, instrument, step))?.mark ?? '';
  }

  function open(cell: HTMLButtonElement, instrument: InstrumentId, step: number): void {
    abandonHold();
    menu = { instrument, step, cell };
  }

  /** Every way out of the menu comes through here, so focus can only land back
   *  on the cell it was opened from. */
  function close(): void {
    const opener = menu?.cell;
    menu = undefined;
    if (opener === undefined) return;

    opener.focus();
    /* A press that dismissed the menu moves the focus itself, once this
       handler has returned: onto whatever it landed on, or off everything if
       that was not focusable. The cell takes it back only in the second case —
       a press on another control is a reader going somewhere. */
    setTimeout(() => {
      if (document.activeElement === document.body) opener.focus();
    });
  }

  /* What a cell sounds like the moment it is written. The core says which hits
     an articulation makes, at which rung and how far apart — a flam auditions
     as a flam. `empty` makes none, which is how rubbing a cell out stays silent
     without a special case here. */
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
    // A press starting with the menu open is dismissing it and nothing else;
    // the dismissal itself is the menu's business.
    swallowClick = menu !== undefined;
    // Secondary buttons raise a contextmenu of their own; only a primary press
    // can become a hold.
    if (event.button !== 0) return;

    const cell = event.currentTarget as HTMLButtonElement;
    abandonHold();
    origin = { x: event.clientX, y: event.clientY };
    hold = setTimeout(() => {
      swallowClick = true;
      open(cell, instrument, step);
    }, HOLD_MS);
  }

  /* A finger that has started to travel is scrolling or dragging, not holding —
     and the browser may take the gesture away entirely, which arrives as a
     cancelled pointer. */
  function pressMove(event: PointerEvent): void {
    if (origin === undefined) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > DRIFT_PX) abandonHold();
  }

  function abandonHold(): void {
    clearTimeout(hold);
    hold = undefined;
    origin = undefined;
  }

  /* Writing a hit plays it; rubbing one out is silent. Every cell makes sound,
     so the grid waits for the samples rather than letting a tap land mutely. */
  function tap(instrument: InstrumentId, step: number): void {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    audition(instrument, patternState.toggle(instrument, step));
  }

  /* One handler for right-click and for the keyboard's own way of asking — the
     Menu key and Shift+F10 both arrive here. */
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
        <!-- Abbreviated so the label column costs the cells little width; the
             full name is a hover away, and names every cell in the row. -->
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
  /* Bars sit side by side when two fit at a legible cell size, else stack — the
     breakpoint comes from this grid's content, not a shared constant.
     `min(..., 100%)` keeps one bar from overflowing a narrower phone. */
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
    /* Hairline: every point between cells is a point off their width, and each
       cell's border already separates it from its neighbour. */
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

  /* Side by side, one set of labels names the rows of every bar in the row, so
     the repeat is noise — the cells take back the width instead. The leading
     column goes with the labels, keeping the counts over their own cells.
     47.5rem is where auto-fit above fits a second 23rem bar past the 1.5rem
     gap: the two numbers move together. */
  @container (min-width: 47.5rem) {
    .bar:not(:first-of-type) {
      grid-template-columns: repeat(var(--steps), 1fr);
    }

    .bar:not(:first-of-type) .corner,
    .bar:not(:first-of-type) .name {
      display: none;
    }
  }

  /* Square wherever the step column is narrower than the comfortable height,
     which on a phone is everywhere: squares read as a grid, tall thin slots
     read as bars. Capped rather than fixed, so a wide screen keeps a short row
     instead of growing squares the size of the label column. */
  .cell {
    min-width: 0;
    aspect-ratio: 1;
    max-height: 2rem;
    /* A button starts on the platform's own font rather than the page's, and
       the letters below are the page's letters. */
    font: inherit;
    /* So the mark inside can size itself off the cell it sits in, which is the
       only thing that keeps a glyph proportionate from desktop to phone. */
    container-type: size;
    padding: 0;
    border: 1px solid #d1d5db;
    border-radius: 3px;
    background: #f9fafb;
    cursor: pointer;
    /* Held together on purpose: a hold on a cell is this app's gesture, and on
       touch the platform would otherwise answer it first — with its own callout
       and a word-selection. `manipulation` still leaves the page scrollable
       with a finger that starts on a cell. */
    touch-action: manipulation;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  /* Beat boundaries: 1, 2, 3, 4 visible at a glance. */
  .cell.beat {
    border-left: 3px solid #9ca3af;
    background: #eef2f7;
  }

  /* Lights the whole column. Above the filled-cell rule on purpose: a written
     hit keeps its colour as the playhead passes, and the ring marks the column
     on filled and empty cells alike. */
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

  /* The cell's articulation, in the page's own characters and sized off the
     cell rather than the page: the square shrinks on a phone and the mark goes
     with it. Bold, since a character drawn white on the fill has none of an
     engraved glyph's weight to carry it. White on that fill, which is the only
     ground it ever sits on — the playhead lights an empty cell, never a marked
     one. */
  .mark {
    display: grid;
    place-items: center;
    font-size: 80cqh;
    font-weight: 700;
    line-height: 0;
    color: #fff;
    pointer-events: none;
  }

  /* A pair held apart where every other mark is a single character, so it is
     set smaller to keep inside the same square. */
  .cell[data-articulation='ghost'] .mark {
    font-size: 50cqh;
  }

  /* A letter's ink sits high in the em box that centres it — the space a
     descender would take is empty — so it comes back down to sit in the middle
     of the cell. `>` centres on the line by itself, and the parentheses
     straddle it, so neither is moved. */
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
