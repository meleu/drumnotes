<script lang="ts">
  import type { InstrumentId } from '../core/pattern.js';
  import { INSTRUMENTS, STEPS_PER_BAR, gridBars, isHit } from '../core/pattern.js';
  import { audioState } from '../state/audio.svelte.js';
  import { patternState } from '../state/pattern.svelte.js';
  import { transportState } from '../state/transport.svelte.js';

  const bars = gridBars();

  /* Writing a hit plays it; rubbing one out is silent. Every cell makes sound,
     so the grid waits for the samples rather than letting a tap land mutely. */
  function toggle(instrument: InstrumentId, step: number): void {
    if (patternState.toggle(instrument, step)) audioState.audition(instrument);
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
            aria-pressed={isHit(patternState.current, instrument.id, step.index)}
            aria-label="{instrument.name}, step {step.index + 1}"
            data-instrument={instrument.id}
            data-step={step.index}
            disabled={!audioState.ready}
            onclick={() => toggle(instrument.id, step.index)}
          ></button>
        {/each}
      {/each}
    </section>
  {/each}
</div>

<style>
  /* Bars sit side by side when two fit at a legible cell size, else stack — the
     breakpoint comes from this grid's content, not a shared constant.
     `min(..., 100%)` keeps one bar from overflowing a narrower phone. */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(23rem, 100%), 1fr));
    gap: 1.5rem;
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

  /* Square wherever the step column is narrower than the comfortable height,
     which on a phone is everywhere: squares read as a grid, tall thin slots
     read as bars. Capped rather than fixed, so a wide screen keeps a short row
     instead of growing squares the size of the label column. */
  .cell {
    min-width: 0;
    aspect-ratio: 1;
    max-height: 2rem;
    padding: 0;
    border: 1px solid #d1d5db;
    border-radius: 3px;
    background: #f9fafb;
    cursor: pointer;
    touch-action: manipulation;
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

  /* Samples still decoding: readable, not yet playable. */
  .cell:disabled {
    cursor: progress;
    opacity: 0.55;
  }
</style>
