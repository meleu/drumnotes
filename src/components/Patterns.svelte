<script lang="ts">
  import { libraryState } from '../state/library.svelte.js';
  import { patternState } from '../state/pattern.svelte.js';

  /* A disclosure, not a dialog: the panel opens under the controls row and
     pushes the grid down, so nothing is covered and nothing has to be
     dismissed. Closed when the app opens — the interface looks exactly as it
     did until the library is asked for. */
  let open = $state(false);
  const PANEL_ID = 'patterns-panel';

  let name = $state('');

  const entries = $derived(libraryState.entries);

  /* Save takes a copy of what is on the grid. The panel stays open afterwards,
     so the new row can be seen arriving. */
  function save(): void {
    if (name === '') return;
    libraryState.keep(name, patternState.current);
  }
</script>

<button
  type="button"
  class="toggle"
  data-patterns="toggle"
  aria-expanded={open}
  aria-controls={PANEL_ID}
  onclick={() => (open = !open)}
>
  Patterns
</button>

{#if open}
  <!-- A full-width flex item, ordered last, so it lands on its own line beneath
       the whole controls row rather than splitting it. -->
  <div class="panel" id={PANEL_ID}>
    <div class="keep">
      <label for="pattern-name">Name</label>
      <input id="pattern-name" type="text" data-patterns="name" bind:value={name} />
      <button type="button" data-patterns="save" onclick={save}>Save</button>
    </div>

    {#if entries.length === 0}
      <p class="empty" data-patterns="empty">Nothing kept yet.</p>
    {:else}
      <ul class="rows" data-patterns="rows">
        {#each entries as entry (entry.name)}
          <li class="row" data-pattern={entry.name}>
            <span class="name">{entry.name}</span>
            <span class="tempo">{entry.pattern.tempo} BPM</span>
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
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.25rem;
    border-top: 1px solid #f3f4f6;
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
