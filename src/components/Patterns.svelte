<script lang="ts">
  import { MAX_NAME_LENGTH, sameName } from '../core/library.js';
  import type { Pattern } from '../core/pattern.js';
  import { hasHits } from '../core/pattern.js';
  import { libraryState } from '../state/library.svelte.js';
  import { patternState } from '../state/pattern.svelte.js';
  import { session } from '../state/session.svelte.js';

  /* A disclosure, not a dialog: the panel opens under the controls row and
     pushes the grid down, so nothing is covered and nothing has to be
     dismissed. Closed when the app opens — the interface looks exactly as it
     did until the library is asked for. */
  let open = $state(false);
  const PANEL_ID = 'patterns-panel';

  let name = $state('');

  const entries = $derived(libraryState.entries);

  /* The panel opens with a free name already in the field, so keeping a groove
     costs one press when none has been thought of. Set on opening rather than
     derived: from then on the field is the drummer's to type in, and a
     suggestion that rewrote itself under them would be worse than none. */
  function toggleOpen(): void {
    open = !open;
    if (open) name = libraryState.freeName;
  }

  /* What the drummer typed, less the whitespace around it: the name is kept and
     shown as it reads, not as it was padded. */
  const typed = $derived(name.trim());

  /* Dead in the two cases where pressing it could only do harm: nothing is ever
     kept under no name at all, and the library does not fill with silence. The
     second matches Clear, which is dead on an empty grid for the same reason. */
  const keepable = $derived(typed !== '' && hasHits(patternState.current));

  /** How long a question stands before it is taken back. */
  const QUESTION_MS = 5000;

  /* A name already kept holds a groove the drummer meant to keep, so writing
     over one costs two presses like every other act with nothing behind it.
     What is armed is the name the question was asked about, not a flag: editing
     the field to a free name takes the question back, so it can never be
     answered against a name other than the one it was put about. */
  let askedOver = $state<string | null>(null);
  let withdrawSave: ReturnType<typeof setTimeout> | undefined;

  const taken = $derived(libraryState.holds(typed));
  const replacing = $derived(askedOver !== null && taken && sameName(askedOver, typed));

  /* Save takes a copy of what is on the grid. The panel stays open afterwards,
     so the new row can be seen arriving — under the name as typed, since a
     replacement adopts the spelling that replaced it. */
  function pressSave(): void {
    if (taken && !replacing) {
      askedOver = typed;
      clearTimeout(withdrawSave);
      withdrawSave = setTimeout(forgetSave, QUESTION_MS);
      return;
    }
    forgetSave();
    libraryState.keep(typed, patternState.current);
  }

  /** Also on blur, as with every other question here: attention elsewhere is an
   *  answer of sorts. */
  function forgetSave(): void {
    askedOver = null;
    clearTimeout(withdrawSave);
  }

  /* Loading goes the other way, through the session seam: a wholesale
     replacement stops the loop, and the pattern autosaves as the current one
     through the same funnel an edit does. Then the panel closes: it has done
     its job, and the drummer is returned to the grid and staff they came here
     to work on. */
  function load(pattern: Pattern): void {
    session.load(pattern);
    open = false;
  }

  /* Deleting has nothing behind it either — no undo, and the rows are as wide
     as a thumb — so it costs two presses, the same as clearing does. The
     question is a name rather than a flag: only the row it was asked about is
     armed, and asking about another takes the first back. */
  let asked = $state<string | null>(null);
  let withdraw: ReturnType<typeof setTimeout> | undefined;

  function press(name: string): void {
    if (asked === name) {
      forget();
      libraryState.remove(name);
      return;
    }
    asked = name;
    clearTimeout(withdraw);
    withdraw = setTimeout(forget, QUESTION_MS);
  }

  /* Also on blur: attention elsewhere is an answer of sorts, and an armed
     control left lying around is exactly what the question guards against. */
  function forget(): void {
    asked = null;
    clearTimeout(withdraw);
  }
</script>

<button
  type="button"
  class="toggle"
  data-patterns="toggle"
  aria-expanded={open}
  aria-controls={PANEL_ID}
  onclick={toggleOpen}
>
  Patterns
</button>

{#if open}
  <!-- A full-width flex item, ordered last, so it lands on its own line beneath
       the whole controls row rather than splitting it. -->
  <div class="panel" id={PANEL_ID}>
    <div class="keep">
      <label for="pattern-name">Name</label>
      <!-- The suggestion arrives selected, so typing a real name replaces it
           rather than having to be cleared first. -->
      <input
        id="pattern-name"
        type="text"
        data-patterns="name"
        maxlength={MAX_NAME_LENGTH}
        bind:value={name}
        {@attach (node) => {
          node.focus();
          node.select();
        }}
      />
      <!-- Asks before it writes over a name already kept, and says so where the
           press will land. It reports its state, so a test or stylesheet need
           not read the label. -->
      <button
        type="button"
        class="save"
        data-patterns="save"
        data-state={replacing ? 'asking' : 'idle'}
        aria-label={replacing ? `Replace ${typed}? Press again to confirm` : 'Save'}
        disabled={!keepable}
        onclick={pressSave}
        onblur={forgetSave}
      >
        {replacing ? 'Replace?' : 'Save'}
      </button>
    </div>

    {#if entries.length === 0}
      <p class="empty" data-patterns="empty">Nothing kept yet.</p>
    {:else}
      <ul class="rows" data-patterns="rows">
        {#each entries as entry (entry.name)}
          <li class="row" data-pattern={entry.name}>
            <!-- Loading is the whole width the delete control leaves, so the
                 target is as wide as the panel and a thumb cannot miss it. -->
            <button
              type="button"
              class="load"
              data-patterns="load"
              onclick={() => load(entry.pattern)}
            >
              <span class="name">{entry.name}</span>
              <span class="tempo">{entry.pattern.tempo} BPM</span>
            </button>
            <button
              type="button"
              class="delete"
              data-patterns="delete"
              data-state={asked === entry.name ? 'asking' : 'idle'}
              aria-label={asked === entry.name
                ? `Delete ${entry.name}? Press again to confirm`
                : `Delete ${entry.name}`}
              onclick={() => press(entry.name)}
              onblur={forget}
            >
              {asked === entry.name ? 'Sure?' : 'Delete'}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .toggle,
  .keep button {
    padding: 0.6rem 0.9rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }

  .keep button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .save {
    /* Held wide enough for either label, so the row does not shuffle when the
       question comes up. */
    min-width: 6rem;
  }

  /* Asking looks like what it is about to do. */
  .save[data-state='asking'] {
    border-color: #b91c1c;
    background: #fee2e2;
    color: #991b1b;
    font-weight: 600;
  }

  .panel {
    /* Laid out after every other control in the row, and wide enough to force
       its own line: the row keeps its order, the panel sits under all of it. */
    order: 1;
    flex-basis: 100%;
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fff;
  }

  .keep {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .keep input {
    flex: 1 1 10rem;
    padding: 0.6rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font: inherit;
  }

  .rows {
    margin: 0.75rem 0 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-top: 1px solid #f3f4f6;
  }

  /* Sized to the row rather than to its text: the whole line is the target. */
  .load {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.25rem;
    border: 0;
    border-radius: 4px;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }

  .load:hover {
    background: #f9fafb;
  }

  .delete {
    /* Held wide enough for either label, so the row does not shuffle when the
       question comes up. */
    min-width: 4.5rem;
    flex: none;
    padding: 0.5rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    touch-action: manipulation;
  }

  /* Asking looks like what it is about to do. */
  .delete[data-state='asking'] {
    border-color: #b91c1c;
    background: #fee2e2;
    color: #991b1b;
    font-weight: 600;
  }

  .tempo,
  .empty {
    font-size: 0.8125rem;
    color: #6b7280;
  }

  .empty {
    margin: 0.75rem 0 0;
  }
</style>
