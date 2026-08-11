<script lang="ts">
  import { hasHits } from '../core/pattern.js';
  import { patternState } from '../state/pattern.svelte.js';

  const written = $derived(hasHits(patternState.current));
</script>

<!-- Dead on an already-silent pattern: there is nothing to rub out, and a
     control that can only be a no-op should say so before it is pressed. -->
<button type="button" class="clear" disabled={!written} onclick={() => patternState.clear()}>
  Clear
</button>

<style>
  .clear {
    padding: 0.6rem 0.9rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }

  .clear:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
