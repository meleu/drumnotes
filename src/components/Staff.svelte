<script lang="ts">
  import { BARS } from '../core/pattern.js';
  import { toScore } from '../core/score.js';
  import { loadNotationFont, renderScoreSvg, staffLayoutFor } from '../adapters/notation.js';
  import { patternState } from '../state/pattern.svelte.js';

  let frame = $state<HTMLElement | undefined>(undefined);
  let sheet = $state<HTMLDivElement | undefined>(undefined);
  let fontReady = $state(false);
  let width = $state(0);

  /* Every musical decision is already made by the time the score gets here. */
  const score = $derived(toScore(patternState.current));

  /*
   * Nothing is drawn until the music font has loaded: glyphs measured against a
   * missing font lay out at the wrong widths, and that wrong layout is what a
   * reader would see before the right one replaced it.
   */
  $effect(() => {
    let live = true;
    void loadNotationFont().then(() => {
      if (live) fontReady = true;
    });
    return () => {
      live = false;
    };
  });

  /*
   * The staff wraps at its own content's minimum legible width, measured off
   * the element rather than agreed with the grid through a shared breakpoint —
   * the two are free to switch at different widths.
   */
  $effect(() => {
    if (!frame) return;

    /*
     * The measurement is deferred to the next frame rather than taken inside
     * the callback: drawing changes the staff's height, which can add or remove
     * the page's scrollbar and so change this element's width again. Writing
     * synchronously makes that a loop the browser reports as an error.
     */
    let pending = 0;
    const observer = new ResizeObserver(([entry]) => {
      const measured = entry?.contentRect.width ?? 0;
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        width = measured;
      });
    });
    observer.observe(frame);
    return () => {
      cancelAnimationFrame(pending);
      observer.disconnect();
    };
  });

  $effect(() => {
    if (!sheet || width === 0) return;

    renderScoreSvg(sheet, score, staffLayoutFor(width, BARS));
  });
</script>

<section class="staff" bind:this={frame} aria-label="Notation">
  {#if fontReady}
    <div class="sheet" bind:this={sheet}></div>
  {/if}
</section>

<style>
  .staff {
    /* Holds the staff's room before it is drawn, so the page does not jump. */
    min-height: 10rem;
    margin-top: 1.5rem;
  }

  /*
   * The drawing carries a viewBox, so overriding the rendered size scales it
   * rather than clipping it. This is what lets a phone show a whole measure.
   */
  .sheet :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
