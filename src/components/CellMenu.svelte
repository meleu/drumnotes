<script lang="ts">
  import type { Articulation } from '../core/pattern.js';
  import { ARTICULATION_CHOICES } from '../core/pattern.js';

  interface Props {
    /** The cell the menu belongs to: what it points at, and where focus goes. */
    anchor: HTMLElement;
    /** Marked as chosen, on an empty cell as much as a written one. */
    current: Articulation;
    /** Names the menu, so it says which cell it is acting on. */
    label: string;
    onchoose: (articulation: Articulation) => void;
    onclose: () => void;
  }

  const { anchor, current, label, onchoose, onclose }: Props = $props();

  /** Kept off the viewport edge, so a cell in the last column stays reachable. */
  const MARGIN_PX = 8;

  let menu = $state<HTMLDivElement>();
  let left = $state(0);
  let top = $state(0);

  /* Anchored to the cell rather than to the pointer, so a hold, a right-click
     and the Menu key all put it in the same place. Measured after it is drawn:
     its size depends on the entries it happens to be offering. */
  $effect(() => {
    if (menu === undefined) return;
    const cell = anchor.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const room = (start: number, size: number, extent: number) =>
      Math.max(MARGIN_PX, Math.min(start, extent - size - MARGIN_PX));

    left = room(cell.left, box.width, window.innerWidth);
    top = room(cell.bottom + MARGIN_PX / 2, box.height, window.innerHeight);
  });

  /* Focus lands on the entry the cell already holds, so the menu opens where
     the reader is and Enter alone changes nothing. */
  $effect(() => {
    const held = ARTICULATION_CHOICES.findIndex(({ id }) => id === current);
    entries()[Math.max(held, 0)]?.focus();
  });

  function entries(): HTMLButtonElement[] {
    return [...(menu?.querySelectorAll('button') ?? [])];
  }

  /** Roving focus: a menu is one stop, walked with the arrows and wrapping. */
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

  /* A press anywhere else is a dismissal, whatever it lands on — including the
     cell that opened the menu, which would otherwise reopen it. */
  function pressedOutside(event: PointerEvent): void {
    if (menu !== undefined && !menu.contains(event.target as Node)) onclose();
  }
</script>

<svelte:window onkeydown={keydown} onpointerdown={pressedOutside} />

<!-- Fixed, not absolute: the grid scrolls and the cells are its own layout, so
     the menu is positioned against the viewport it is measured in. -->
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
    /* Room for the mark, so the entries' labels line up whether or not one of
       them is the chosen one. */
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

  /* The one it already holds, marked rather than merely highlighted: focus
     starts here, and the two must stay tellable apart. */
  .menu button[aria-checked='true']::before {
    content: '✓';
    /* Pulled back into the padding, so the label does not shift when marked. */
    margin-left: -1.25rem;
    padding-right: 0.5rem;
    font-weight: 700;
  }
</style>
