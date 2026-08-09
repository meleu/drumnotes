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

  /* Every musical decision is already made by the time it gets here. */
  const score = $derived(toScore(patternState.current));
  const layout = $derived(staffLayoutFor(width, BARS));

  /* The measure being read, as a patch of the drawing. An overlay rather than
     part of the drawing, so the export (which shares it) carries no playhead,
     and a step change repaints one rectangle instead of re-engraving. */
  const shading = $derived.by(() => {
    const step = transportState.playhead;
    if (step === null || width === 0) return undefined;
    return measureBoxes(score, layout)[barOfStep(step)];
  });

  /* Nothing drawn until the font loads: glyphs measured against a missing font
     lay out at the wrong widths, and the reader would see it. */
  $effect(() => {
    let live = true;
    void loadNotationFont().then(() => {
      if (live) fontReady = true;
    });
    return () => {
      live = false;
    };
  });

  /* Wraps at its own content's minimum legible width, measured off the element
     rather than shared with the grid as a breakpoint. */
  $effect(() => {
    if (!frame) return;

    /* Deferred to the next frame: drawing changes the staff's height, which can
       add or remove the scrollbar and so change this width again. Writing
       synchronously makes that a loop the browser reports as an error. */
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
        <!-- Same box and coordinates as the drawing under it, so the rectangle
             lands on the measure however the page is scaled. -->
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
    /* Holds room before the staff is drawn, so the page does not jump. */
    min-height: 10rem;
    margin-top: 1.5rem;
  }

  .page {
    position: relative;
  }

  /* The drawing carries a viewBox, so overriding the rendered size scales
     rather than clips — which is what lets a phone show a whole measure. */
  .sheet :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  /* Positioned, and after the shading in document order: that is what puts the
     notes on top. The sheet must stay in flow to give `.page` its height, and
     an in-flow box would otherwise paint *below* a positioned one. */
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

  /* Faint, behind the ink: the bar is obvious, its noteheads stay legible. */
  .playhead rect {
    fill: #fef3c7;
  }
</style>
