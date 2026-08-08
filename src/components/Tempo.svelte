<script lang="ts">
  import { MAX_TEMPO, MIN_TEMPO, TEMPO_STEP } from '../core/pattern.js';
  import { patternState } from '../state/pattern.svelte.js';

  const tempo = $derived(patternState.current.tempo);

  /**
   * A typed number goes to the core, which may correct it — and then the field
   * has to be told what actually happened. Svelte only writes a value the field
   * already disagrees with when the state itself changed, so typing 999 against
   * a tempo already at the ceiling would otherwise leave 999 on screen while
   * 240 plays. Writing it back unconditionally keeps the number honest.
   */
  function commit(event: Event & { currentTarget: HTMLInputElement }): void {
    patternState.setTempo(event.currentTarget.valueAsNumber);
    event.currentTarget.value = String(patternState.current.tempo);
  }

  function nudge(by: number): void {
    patternState.setTempo(tempo + by);
  }
</script>

<!-- Buttons flank the number so the tempo can be walked with a thumb, one tap
     at a time, without a keyboard ever appearing. -->
<div class="tempo">
  <button
    type="button"
    aria-label="Slower"
    onclick={() => nudge(-TEMPO_STEP)}
    disabled={tempo <= MIN_TEMPO}
  >
    −
  </button>
  <input
    type="number"
    aria-label="Tempo in beats per minute"
    inputmode="numeric"
    min={MIN_TEMPO}
    max={MAX_TEMPO}
    step={TEMPO_STEP}
    value={tempo}
    onchange={commit}
  />
  <span class="unit">BPM</span>
  <button
    type="button"
    aria-label="Faster"
    onclick={() => nudge(TEMPO_STEP)}
    disabled={tempo >= MAX_TEMPO}
  >
    +
  </button>
</div>

<style>
  .tempo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  button {
    width: 2.75rem;
    padding: 0.6rem 0;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    font: inherit;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    touch-action: manipulation;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  input {
    width: 4.5rem;
    padding: 0.6rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font: inherit;
    text-align: center;
  }

  .unit {
    font-size: 0.8125rem;
    color: #6b7280;
  }
</style>
