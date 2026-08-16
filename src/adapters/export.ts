/**
 * Notation → picture → the person who asked for it.
 *
 * Same `drawScore` and `Score` as the screen, differing only in context and
 * layout — no second engraver to disagree. Layout is fixed (one system, one
 * width), so phone and desktop export the same picture. Playhead shading is a
 * screen-only overlay, so nothing has to be removed here.
 */

import { CanvasContext } from 'vexflow/core';

import { EXPORT_SCALE } from '../core/export.js';
import { exportStaffLayout, placeMeasures, staffSize } from '../core/layout.js';
import type { Score } from '../core/score.js';
import { drawScore, loadNotationFont } from './notation.js';

/** Opaque and light: black ink needs paper behind it. */
const PAPER = '#ffffff';
/** Stated, not assumed: VexFlow overrides the fill style only where an element
 *  asks for its own colour, else it's white on white. */
const INK = '#000000';

/**
 * Score → PNG, via an off-document canvas. Drawn at `EXPORT_SCALE`× logical
 * size: same points, more pixels, so it holds up opened at full size.
 */
export async function renderScorePng(score: Score): Promise<Blob> {
  // Glyphs measured against a missing font get wrong widths, and an image
  // cannot be corrected a moment later.
  await loadNotationFont();

  const layout = exportStaffLayout(score);
  const { width, height } = staffSize(score, layout);

  const canvas = document.createElement('canvas');
  canvas.width = width * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw to a canvas.');

  // Scale first, so everything after — paper included — is in `drawScore` points.
  context.scale(EXPORT_SCALE, EXPORT_SCALE);
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);
  context.fillStyle = INK;
  context.strokeStyle = INK;

  // Margins: the ones `staffSize` and `drawScore` already agree on.
  drawScore(new CanvasContext(context), score, placeMeasures(score, layout));

  return await toPng(canvas);
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))),
      'image/png',
    );
  });
}

/** Whether this browser can put an image on the clipboard. Decides if the
 *  control exists, not if it's enabled. */
export function canCopyImage(): boolean {
  return typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function';
}

/**
 * Copies an image still being drawn. Takes the promise, not the blob: clipboard
 * writes are only honoured inside a user gesture, and awaiting spends it.
 */
export async function copyImage(image: Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]);
}

export function downloadImage(image: Blob, filename: string): void {
  const url = URL.createObjectURL(image);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  // A task later: revoking in the same turn can race the browser.
  setTimeout(() => URL.revokeObjectURL(url));
}
