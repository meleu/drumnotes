<script lang="ts">
  import { INSTRUMENTS, STEPS_PER_BAR, gridBars, isStepFilled } from '../core/pattern.js';
  import { patternState } from '../state/pattern.svelte.js';

  const bars = gridBars();
</script>

<div class="grid">
  {#each bars as bar (bar.index)}
    <section class="bar" style:--steps={STEPS_PER_BAR} aria-label="Bar {bar.index + 1}">
      <span class="corner" aria-hidden="true"></span>
      {#each bar.steps as step (step.index)}
        <span class="count" class:beat={step.isBeatStart} aria-hidden="true">{step.label}</span>
      {/each}

      {#each INSTRUMENTS as instrument (instrument.id)}
        <span class="name">{instrument.name}</span>
        {#each bar.steps as step (step.index)}
          <button
            type="button"
            class="cell"
            class:beat={step.isBeatStart}
            aria-pressed={isStepFilled(patternState.current, instrument.id, step.index)}
            aria-label="{instrument.name}, step {step.index + 1}"
            data-instrument={instrument.id}
            data-step={step.index}
            onclick={() => patternState.toggle(instrument.id, step.index)}
          ></button>
        {/each}
      {/each}
    </section>
  {/each}
</div>

<style>
  /*
   * The bars sit side by side when two of them fit at a legible cell size and
   * stack when they do not, so the breakpoint comes from this grid's own
   * content rather than a shared constant. `min(..., 100%)` keeps a single bar
   * from overflowing a phone narrower than that minimum.
   */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(23rem, 100%), 1fr));
    gap: 1.5rem;
  }

  .bar {
    display: grid;
    grid-template-columns: auto repeat(var(--steps), 1fr);
    gap: 2px;
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

  .cell {
    min-width: 0;
    height: 2rem;
    padding: 0;
    border: 1px solid #d1d5db;
    border-radius: 3px;
    background: #f9fafb;
    cursor: pointer;
    touch-action: manipulation;
  }

  /* Beat boundaries, so 1, 2, 3 and 4 are visible at a glance. */
  .cell.beat {
    border-left: 3px solid #9ca3af;
    background: #eef2f7;
  }

  .cell[aria-pressed='true'] {
    border-color: #1d4ed8;
    background: #2563eb;
  }
</style>
