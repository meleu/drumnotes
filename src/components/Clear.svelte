<script lang="ts">
  import { anythingWritten } from '../core/pattern.js';
  import { patternState } from '../state/pattern.svelte.js';
  import { ABOUT_NOTHING, Question, askingName, stateOf } from '../state/question.svelte.js';
  import { session } from '../state/session.svelte.js';

  const written = $derived(anythingWritten(patternState.current));

  // Erasing has nothing behind it — no undo, autosave straight to storage — so
  // two presses. The question lives in the button, not a dialog: same place,
  // same finger, nothing to dismiss if the answer is no. It is about the whole
  // grid rather than any one thing kept, so there is no subject to name.
  const question = new Question();
  const asking = $derived(question.asking(ABOUT_NOTHING));
  const phrase = 'Clear the pattern';
</script>

<!-- Dead on an already-silent pattern: a control that can only be a no-op
     should say so before it is pressed. Reports its state, so tests and
     stylesheets need not read the label. -->
<button
  type="button"
  class="clear"
  data-state={stateOf(asking)}
  aria-label={asking ? askingName(phrase) : phrase}
  disabled={!written}
  onclick={() => question.press(ABOUT_NOTHING, true, () => session.clear())}
  onblur={() => question.withdraw()}
>
  {asking ? 'Sure?' : 'Clear'}
</button>

<style>
  .clear {
    /* Wide enough for either label, so the row does not shuffle. */
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
