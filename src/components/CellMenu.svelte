<script lang="ts">
  import type { Articulation } from '../core/pattern.js';
  import { ARTICULATION_CHOICES } from '../core/pattern.js';

  interface Props {
    /** The cell it points at, and where focus returns. */
    anchor: HTMLElement;
    /** Marked as chosen, on empty cells as much as written ones. */
    current: Articulation;
    /** Names the menu, saying which cell it acts on. */
    label: string;
    onchoose: (articulation: Articulation) => void;
    onclose: () => void;
  }

  const { anchor, current, label, onchoose, onclose }: Props = $props();

  /** Keeps it off the viewport edge, so last-column cells stay reachable. */
  const MARGIN_PX = 8;

  let menu = $state<HTMLDivElement>();
  let left = $state(0);
  let top = $state(0);

  // Anchored to the cell, not the pointer, so hold, right-click and Menu key
  // agree. Measured after drawing: size depends on the entries offered.
  $effect(() => {
    if (menu === undefined) return;
    const cell = anchor.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const room = (start: number, size: number, extent: number) =>
      Math.max(MARGIN_PX, Math.min(start, extent - size - MARGIN_PX));

    left = room(cell.left, box.width, window.innerWidth);
    top = room(cell.bottom + MARGIN_PX / 2, box.height, window.innerHeight);
  });

  // Focus the entry the cell holds: the menu opens where the reader is, and
  // Enter alone changes nothing.
  $effect(() => {
    const held = ARTICULATION_CHOICES.findIndex(({ id }) => id === current);
    entries()[Math.max(held, 0)]?.focus();
  });

  function entries(): HTMLButtonElement[] {
    return [...(menu?.querySelectorAll('button') ?? [])];
  }

  /** Roving focus: one tab stop, arrows walk and wrap. */
  function step(by: number): void {
    const items = entries();
    const from = items.findIndex((item) => item === document.activeElement);
    items[(from + by + items.length) % items.length]?.focus();
  }

  const WALK: Readonly<Record<string, number | undefined>> = { ArrowDown: 1, ArrowUp: -1 };

  function keydown(event: KeyboardEvent): void {
    const by = WALK[event.key];
    if (event.key === 'Escape') {
      onclose();
    } else if (by !== undefined) {
      step(by);
    } else {
      return;
    }
    event.preventDefault();
  }

  // Any press elsewhere dismisses, including on the opening cell, which would
  // otherwise reopen it.
  function pressedOutside(event: PointerEvent): void {
    if (menu !== undefined && !menu.contains(event.target as Node)) onclose();
  }
</script>

<svelte:window onkeydown={keydown} onpointerdown={pressedOutside} />

<!-- Fixed, not absolute: the grid scrolls, so position against the viewport
     the menu is measured in. -->
<div
  class="menu"
  role="menu"
  aria-label={label}
  bind:this={menu}
  style:left="{left}px"
  style:top="{top}px"
>
  {#each ARTICULATION_CHOICES as choice (choice.id)}
    <button
      type="button"
      role="menuitemradio"
      aria-checked={choice.id === current}
      data-articulation={choice.id}
      onclick={() => onchoose(choice.id)}
    >
      {choice.name}
    </button>
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 9rem;
    padding: 0.25rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    box-shadow: 0 6px 16px rgb(0 0 0 / 0.16);
  }

  .menu button {
    /* Room for the mark, so labels line up chosen or not. */
    padding: 0.5rem 0.75rem 0.5rem 1.75rem;
    border: 0;
    border-radius: 4px;
    background: none;
    font: inherit;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .menu button:hover,
  .menu button:focus-visible {
    background: #eef2f7;
  }

  /* Marked, not just highlighted: focus starts here and the two must differ. */
  .menu button[aria-checked='true']::before {
    content: '✓';
    /* Into the padding, so the label does not shift when marked. */
    margin-left: -1.25rem;
    padding-right: 0.5rem;
    font-weight: 700;
  }
</style>
