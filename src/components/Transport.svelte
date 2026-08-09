<script lang="ts">
  import { audioState } from '../state/audio.svelte.js';
  import { transportState } from '../state/transport.svelte.js';
</script>

<!-- One button: a transport is running or not, so there is only ever one thing
     to do. It reports its state, so a test or stylesheet need not read the
     label. -->
<button
  type="button"
  class="transport"
  data-state={transportState.playing ? 'playing' : 'stopped'}
  disabled={!audioState.ready}
  onclick={() => (transportState.playing ? transportState.stop() : transportState.start())}
>
  {transportState.playing ? 'Stop' : 'Play'}
</button>

<style>
  .transport {
    min-width: 5.5rem;
    padding: 0.6rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .transport:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
