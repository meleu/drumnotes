<script lang="ts">
  import { MAX_TEMPO, MIN_TEMPO } from '../core/pattern.js';
  import { patternState } from '../state/pattern.svelte.js';

  const tempo = $derived(patternState.current.tempo);

  /**
   * The core may correct a typed number and the field must be told. Svelte only
   * rewrites on state change, so typing 999 at an already-capped tempo would
   * leave 999 on screen while 240 plays. Write back unconditionally.
   */
  function commit(event: Event & { currentTarget: HTMLInputElement }): void {
    patternState.setTempo(event.currentTarget.valueAsNumber);
    event.currentTarget.value = String(patternState.current.tempo);
  }
</script>

<div class="tempo">
  <input
    type="number"
    aria-label="Tempo in beats per minute"
    inputmode="numeric"
    min={MIN_TEMPO}
    max={MAX_TEMPO}
    value={tempo}
    onchange={commit}
  />
  <span class="unit">BPM</span>
</div>

<style>
  .tempo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  input {
    width: 5rem;
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
