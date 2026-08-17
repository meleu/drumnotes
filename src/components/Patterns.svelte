<script lang="ts">
  import { tick } from 'svelte';

  import { canKeep } from '../adapters/storage.js';
  import type { Entry } from '../core/library.js';
  import { MAX_NAME_LENGTH, sameName } from '../core/library.js';
  import { anythingWritten } from '../core/pattern.js';
  import { libraryState } from '../state/library.svelte.js';
  import { patternState } from '../state/pattern.svelte.js';
  import { Question, askingName, stateOf } from '../state/question.svelte.js';
  import { session } from '../state/session.svelte.js';

  /* A disclosure, not a dialog: opens under the controls row and pushes the
     grid down, so nothing is covered and nothing has to be dismissed. Closed at
     app open — the interface is unchanged until the library is asked for. */
  let open = $state(false);
  const PANEL_ID = 'patterns-panel';

  /* Answering a question destroys the control that was pressed — the panel
     closes over a load, the row goes on a delete — and the browser then hands
     the keyboard back to the top of the document. Focus goes here instead. */
  let control = $state<HTMLButtonElement>();
  let named = $state<HTMLInputElement>();
  let list = $state<HTMLUListElement>();

  /* Asked once; decides what the panel holds, not what is greyed out. A store
     that keeps nothing never starts, so a field and Save would invite pressing
     something that cannot work. */
  const storable = canKeep();

  let name = $state('');

  const entries = $derived(libraryState.entries);

  /* Opens with a free name already in the field, so keeping costs one press
     when no name was thought of. Set on opening, not derived: the field is the
     drummer's from then on, and a suggestion rewriting itself under them would
     be worse than none. */
  function toggleOpen(): void {
    open = !open;
    if (open) name = libraryState.freeName;
  }

  /* Typed, less surrounding whitespace: kept and shown as it reads, not as it
     was padded. */
  const typed = $derived(name.trim());

  /* Dead where pressing could only harm: nothing is kept under no name, and the
     library does not fill with silence. The second matches Clear, dead on an
     empty grid for the same reason. */
  const keepable = $derived(typed !== '' && anythingWritten(patternState.current));

  /* Overwriting a kept groove costs two presses, like every other act with
     nothing behind it — but only where a groove is there to lose, so a free
     name still keeps outright. The question is about the name being kept, and
     it is asked about the name typed now, so editing the field to something
     free puts Save back with nothing here to say so. */
  const replacement = new Question();

  const taken = $derived(libraryState.holds(typed));
  const replacing = $derived(replacement.asking(typed));

  /* Takes a copy of the grid. Panel stays open so the new row is seen arriving
     — under the name as typed, since a replacement adopts the new spelling. */
  function pressSave(): void {
    replacement.press(typed, taken, () => libraryState.keep(typed, patternState.current));
  }

  /* Which row the grid is — derived from the grid, so it goes out the moment a
     cell or the tempo changes and comes back when that is undone. Nothing
     remembered, so nothing can go stale. */
  const onGrid = $derived(libraryState.onGrid);

  /* Loading throws the grid away, so it asks — but only with something to lose.
     A kept grid can be loaded again and an empty one holds nothing, so either
     question would interrupt about nothing. Unkept hits are worth a press. */
  const atStake = $derived(onGrid === null && anythingWritten(patternState.current));

  /* The question is about the row, so what it says names the row: an answer can
     never be given about a groove other than the one asked about. */
  const loading = new Question();

  /* Reads the same heard as seen: mark and question both go in the label, since
     neither is in the button's text. */
  function loadLabel(entry: Entry): string {
    const row = `${entry.name}, ${entry.pattern.tempo} BPM`;
    if (loading.asking(entry.name)) return askingName(`Load ${row} over unkept work`);
    return onGrid === entry.name ? `${row}, on the grid` : `Load ${row}`;
  }

  /* Through the session seam: a wholesale replacement stops the loop, and the
     pattern autosaves as current through the same funnel an edit uses. Then the
     panel closes, returning the drummer to the grid and staff. */
  function pressLoad(entry: Entry): void {
    loading.press(entry.name, atStake, () => {
      session.load(entry.pattern);
      open = false;
      /* The panel under the finger has gone, so focus returns to the control
         that opened it — the one press that would open it again. */
      void tick().then(() => control?.focus());
    });
  }

  /* Deleting has nothing behind it either — no undo, rows as wide as a thumb —
     so two presses, like clearing. The question is about the row's name, so only
     the row asked about is armed and asking about another takes the first back.
     Nothing at the call site says so: one question armed by one subject is. */
  const deletion = new Question();

  function pressDelete(name: string): void {
    deletion.press(name, true, () => {
      const at = entries.findIndex((entry) => sameName(entry.name, name));
      libraryState.remove(name);
      void tick().then(() => handOn(at));
    });
  }

  /* Where the keyboard goes once its row is gone: the row that took its place,
     so a second deletion is another press rather than another tab walk — and
     back to the field once the last row is dropped. */
  function handOn(at: number): void {
    const controls = list ? [...list.querySelectorAll<HTMLButtonElement>('.delete')] : [];
    const next = controls[Math.min(at, controls.length - 1)];
    (next ?? named)?.focus();
  }
</script>

<button
  type="button"
  class="toggle"
  data-patterns="toggle"
  aria-expanded={open}
  aria-controls={PANEL_ID}
  bind:this={control}
  onclick={toggleOpen}
>
  Patterns
</button>

{#if open}
  <!-- A full-width flex item, ordered last, so it lands on its own line beneath
       the whole controls row rather than splitting it. -->
  <div class="panel" id={PANEL_ID}>
    {#if !storable}
      <!-- The whole panel, when nothing can be kept: the fact, and no guess at
           a cause the probe cannot tell apart. Deliberately not the
           empty-library line, which is an invitation this browser cannot
           accept. -->
      <p class="blocked" data-patterns="blocked">
        This browser will not let anything be kept here.
      </p>
    {:else}
      <div class="keep">
        <label for="pattern-name">Name</label>
        <!-- The suggestion arrives selected, so typing a real name replaces it
           rather than having to be cleared first. -->
        <input
          id="pattern-name"
          type="text"
          data-patterns="name"
          maxlength={MAX_NAME_LENGTH}
          bind:this={named}
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
          data-state={stateOf(replacing)}
          aria-label={replacing ? askingName(`Replace ${typed}`) : 'Save'}
          disabled={!keepable}
          onclick={pressSave}
          onblur={() => replacement.withdraw()}
        >
          {replacing ? 'Replace?' : 'Save'}
        </button>
      </div>

      {#if entries.length === 0}
        <p class="empty" data-patterns="empty">Nothing kept yet.</p>
      {:else}
        <ul class="rows" data-patterns="rows" bind:this={list}>
          {#each entries as entry (entry.name)}
            {@const taking = loading.asking(entry.name)}
            {@const dropping = deletion.asking(entry.name)}
            <li class="row" data-pattern={entry.name} data-on-grid={onGrid === entry.name}>
              <!-- Loading is the whole width the delete control leaves, so the
                 target is as wide as the panel and a thumb cannot miss it.
                 The mark is drawn rather than written — bold, on a tinted row —
                 so the eye finds it without a word of explanation. The label is
                 where it is said in words, for a reader that cannot see it. -->
              <button
                type="button"
                class="load"
                data-patterns="load"
                data-state={stateOf(taking)}
                aria-label={loadLabel(entry)}
                onclick={() => pressLoad(entry)}
                onblur={() => loading.withdraw()}
              >
                <span class="name">{entry.name}</span>
                {#if taking}
                  <span class="question">Sure?</span>
                {:else}
                  <span class="tempo">{entry.pattern.tempo} BPM</span>
                {/if}
              </button>
              <button
                type="button"
                class="delete"
                data-patterns="delete"
                data-state={stateOf(dropping)}
                aria-label={dropping ? askingName(`Delete ${entry.name}`) : `Delete ${entry.name}`}
                onclick={() => pressDelete(entry.name)}
                onblur={() => deletion.withdraw()}
              >
                {dropping ? 'Sure?' : 'Delete'}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .toggle,
  .save {
    padding: 0.6rem 0.9rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }

  .save:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .save {
    /* Wide enough for either label, so the row does not shuffle when the
       question comes up. */
    min-width: 6rem;
  }

  .panel {
    /* Last in the row and wide enough to force its own line: the row keeps its
       order, the panel sits under all of it. */
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

  /* Sized to the row, not its text: the whole line is the target. No shorter
     than the controls above, so a thumb finds it on a phone; its text stays
     centred in whatever height that leaves, and when a long name wraps. */
  .load {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 2.75rem;
    flex-wrap: wrap;
    align-items: baseline;
    align-content: center;
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

  /* Answering the pointer is the idle look. A standing question outranks it:
     the tint says what the next press does, and a hovering finger — the one
     about to press — must not wash it off. */
  .load[data-state='idle']:hover {
    background: #f9fafb;
  }

  /* Takes the tint and nothing else, unlike the three controls shaped like
     buttons: a whole row reddened and emboldened would pull its own text about,
     and the question is already said in the tempo's slot. Puts the ink and the
     weight back to the row's own, so asking and idle read alike. */
  .load[data-state='asking'] {
    color: revert;
    font-weight: inherit;
  }

  /* Small enough to sit in the tempo's slot; its ink and weight are the
     question's own, said once in the global sheet. */
  .question {
    font-size: 0.8125rem;
  }

  .delete {
    /* Wide enough for either label, so the row does not shuffle when the
       question comes up, and no shorter than the control beside it. */
    min-width: 4.5rem;
    min-height: 2.75rem;
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

  .tempo,
  .empty,
  .blocked {
    font-size: 0.8125rem;
    color: #6b7280;
  }

  /* Where the drummer is in their library, said by weight and tint rather than
     words: stands out without announcing itself, and nothing shifts as the mark
     comes and goes. */
  .row[data-on-grid='true'] .name {
    font-weight: 600;
  }

  /* A name may run forty characters with no space to break at. Breaks anywhere
     rather than pushing the panel — and the page — wider than the phone. */
  .name {
    overflow-wrap: anywhere;
  }

  .row[data-on-grid='true'] .load {
    background: #f3f4f6;
  }

  /* Still answers the pointer, a shade further on than it already sits. */
  .row[data-on-grid='true'] .load:hover {
    background: #e5e7eb;
  }

  .empty {
    margin: 0.75rem 0 0;
  }

  /* Alone in the panel, so it does not hang off an absent row. */
  .blocked {
    margin: 0;
  }
</style>
