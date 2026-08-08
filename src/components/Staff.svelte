<script lang="ts">
  import { BARS, barOfStep } from '../core/pattern.js';
  import { toScore } from '../core/score.js';
  import {
    loadNotationFont,
    measureBoxes,
    renderScoreSvg,
    staffLayoutFor,
    staffSize,
  } from '../adapters/notation.js';
  import { patternState } from '../state/pattern.svelte.js';
  import { transportState } from '../state/transport.svelte.js';

  let frame = $state<HTMLElement | undefined>(undefined);
  let sheet = $state<HTMLDivElement | undefined>(undefined);
  let fontReady = $state(false);
  let width = $state(0);

  /* Every musical decision is already made by the time the score gets here. */
  const score = $derived(toScore(patternState.current));
  const layout = $derived(staffLayoutFor(width, BARS));

  /*
   * The measure being read out right now, as a patch of the drawing. Shaded by
   * an overlay rather than by the drawing itself, so the export — which shares
   * that drawing and must carry no playhead — is unaffected, and so a step
   * change repaints one rectangle instead of re-engraving the staff.
   */
  const shading = $derived.by(() => {
    const step = transportState.playhead;
    if (step === null || width === 0) return undefined;
    return measureBoxes(score, layout)[barOfStep(step)];
  });

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

    renderScoreSvg(sheet, score, layout);
  });
</script>

<section class="staff" bind:this={frame} aria-label="Notation">
  {#if fontReady}
    <div class="page">
      {#if shading}
        {@const page = staffSize(score, layout)}
        <!-- Same box and same coordinates as the drawing it sits under, so the
             rectangle lands on the measure however the page is scaled. -->
        <svg
          class="playhead"
          viewBox="0 0 {page.width} {page.height}"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x={shading.x} y={shading.y} width={shading.width} height={shading.height} />
        </svg>
      {/if}
      <div class="sheet" bind:this={sheet}></div>
    </div>
  {/if}
</section>

<style>
  .staff {
    /* Holds the staff's room before it is drawn, so the page does not jump. */
    min-height: 10rem;
    margin-top: 1.5rem;
  }

  .page {
    position: relative;
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

  /*
   * Positioned too, and after the shading in document order — that is what puts
   * the notes on top of it. Two absolutely positioned elements would paint in
   * DOM order as well, but the sheet has to stay in flow to give `.page` its
   * height, and an in-flow box would otherwise paint *below* a positioned one.
   */
  .sheet {
    position: relative;
  }

  .playhead {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* Faint, and behind the ink: the bar being read is obvious at a glance and
     every notehead in it stays as legible as the ones around it. */
  .playhead rect {
    fill: #fef3c7;
  }
</style>
