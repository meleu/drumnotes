<script lang="ts">
  import { canCopyImage, copyImage, downloadImage, renderScorePng } from '../adapters/export.js';
  import { exportFilename } from '../core/export.js';
  import { toScore } from '../core/score.js';
  import { patternState } from '../state/pattern.svelte.js';

  /*
   * Asked once, and used to decide whether the control exists at all rather
   * than whether it is enabled: a disabled button invites a reader to look for
   * the condition that would enable it, and here there is none.
   */
  const copyable = canCopyImage();

  const score = $derived(toScore(patternState.current));

  /** How long "Copied" stays up. Long enough to read, short enough to trust. */
  const CONFIRMATION_MS = 1500;
  let confirming = $state(false);
  let clearConfirmation: ReturnType<typeof setTimeout> | undefined;

  function confirm(): void {
    confirming = true;
    clearTimeout(clearConfirmation);
    clearConfirmation = setTimeout(() => (confirming = false), CONFIRMATION_MS);
  }

  /*
   * The drawing is started but deliberately not awaited before the clipboard is
   * asked: the browser only honours a write that belongs to the click, and
   * awaiting first would spend it.
   */
  function copy(): void {
    copyImage(renderScorePng(score)).then(confirm, (error: unknown) => {
      console.error('The notation could not be copied.', error);
    });
  }

  async function download(): Promise<void> {
    downloadImage(await renderScorePng(score), exportFilename(new Date()));
  }
</script>

<div class="export">
  {#if copyable}
    <button type="button" data-export="copy" onclick={copy}>
      {confirming ? 'Copied' : 'Copy image'}
    </button>
  {/if}
  <button type="button" data-export="download" onclick={download}>Download PNG</button>
</div>

<style>
  .export {
    display: flex;
    gap: 0.5rem;
  }

  button {
    padding: 0.6rem 0.9rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }
</style>
