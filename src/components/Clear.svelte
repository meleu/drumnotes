<script lang="ts">
  import { hasHits } from '../core/pattern.js';
  import { patternState } from '../state/pattern.svelte.js';

  const written = $derived(hasHits(patternState.current));

  /* Erasing is the one act with nothing behind it — no undo, and the autosave
     follows it straight to storage — so it costs two presses. The question
     lives in the button rather than a dialog: same place, same finger, and
     nothing to dismiss if the answer is no. */
  let asking = $state(false);
  /** How long the question stands before it is taken back. */
  const QUESTION_MS = 5000;
  let withdraw: ReturnType<typeof setTimeout> | undefined;

  function press(): void {
    if (asking) {
      forget();
      patternState.clear();
      return;
    }
    asking = true;
    clearTimeout(withdraw);
    withdraw = setTimeout(forget, QUESTION_MS);
  }

  /* Also on blur: attention elsewhere is an answer of sorts, and an armed
     button left lying around is exactly what the question is protecting
     against. */
  function forget(): void {
    asking = false;
    clearTimeout(withdraw);
  }
</script>

<!-- Dead on an already-silent pattern: there is nothing to rub out, and a
     control that can only be a no-op should say so before it is pressed.
     It reports its state, so a test or stylesheet need not read the label. -->
<button
  type="button"
  class="clear"
  data-state={asking ? 'asking' : 'idle'}
  aria-label={asking ? 'Clear the pattern? Press again to confirm' : 'Clear the pattern'}
  disabled={!written}
  onclick={press}
  onblur={forget}
>
  {asking ? 'Sure?' : 'Clear'}
</button>

<style>
  .clear {
    /* Held wide enough for either label, so the row does not shuffle when the
       question comes up. */
    min-width: 5rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }

  /* Asking looks like what it is about to do. */
  .clear[data-state='asking'] {
    border-color: #b91c1c;
    background: #fee2e2;
    color: #991b1b;
    font-weight: 600;
  }

  .clear:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
