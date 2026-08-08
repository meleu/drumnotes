<script lang="ts">
  import { audioState } from '../state/audio.svelte.js';
  import { transportState } from '../state/transport.svelte.js';
</script>

<!-- The transport reports its own state, so it reads as one control rather than
     two buttons that happen to sit together. -->
<div class="transport" data-state={transportState.playing ? 'playing' : 'stopped'}>
  <button
    type="button"
    onclick={() => transportState.start()}
    disabled={!audioState.ready || transportState.playing}
  >
    Play
  </button>
  <button
    type="button"
    onclick={() => transportState.stop()}
    disabled={!audioState.ready || !transportState.playing}
  >
    Stop
  </button>
</div>

<style>
  .transport {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  button {
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

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
