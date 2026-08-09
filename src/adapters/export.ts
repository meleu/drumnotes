/**
 * Turning the notation into a picture, and handing that picture to the person
 * who asked for it.
 *
 * The drawing itself is not re-implemented here: the export calls the very same
 * `drawScore` the screen does, from the same `Score`, and differs from it in
 * nothing but the rendering context and the layout it passes in. That is what
 * makes the exported image trustworthy — there is no second engraver that could
 * quietly disagree with the first.
 *
 * The layout it passes is fixed rather than measured: always one system, always
 * the same logical width, so an export from a phone and an export from a
 * desktop are the same picture. And because the playhead shading is an overlay
 * the screen draws over `drawScore` rather than something `drawScore` draws,
 * the export carries no trace of it without having to remove anything.
 */

import { CanvasContext } from 'vexflow/core';

import { EXPORT_SCALE, EXPORT_WIDTH } from '../core/export.js';
import type { Score } from '../core/score.js';
import type { StaffLayout } from './notation.js';
import { drawScore, loadNotationFont, staffSize } from './notation.js';

/** Opaque, and light: the notation is black ink and needs paper behind it. */
const PAPER = '#ffffff';
/**
 * What the notation is drawn in. Stated rather than assumed: a canvas has one
 * fill style and VexFlow only overrides it where an element asks for a colour
 * of its own, so whatever the paper was filled with would otherwise become the
 * colour of every notehead, rest and beam — white ink on white paper.
 */
const INK = '#000000';

/** Every measure on one system, at the fixed width, whatever the viewport says. */
function exportLayout(score: Score): StaffLayout {
  return { width: EXPORT_WIDTH, measuresPerSystem: score.measures.length };
}

/**
 * Draws the score to a canvas that is never in the document, and returns it as
 * a PNG. Drawn at `EXPORT_SCALE` times its logical size — the points the
 * notation is laid out in stay the same, the pixels recording them multiply —
 * so the result stands up to being opened at full size.
 */
export async function renderScorePng(score: Score): Promise<Blob> {
  // Glyphs measured against a missing font lay out at the wrong widths, and an
  // image is not something the reader can wait a moment and see corrected.
  await loadNotationFont();

  const layout = exportLayout(score);
  const { width, height } = staffSize(score, layout);

  const canvas = document.createElement('canvas');
  canvas.width = width * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw to a canvas.');

  // Scaled first, so everything after it — the paper included — is written in
  // the same points `drawScore` lays the staff out in.
  context.scale(EXPORT_SCALE, EXPORT_SCALE);
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);
  context.fillStyle = INK;
  context.strokeStyle = INK;

  // The margin around the staff is the one `staffSize` and `drawScore` already
  // agree on: the paper is the whole drawing, and the drawing has room at its
  // edges.
  drawScore(new CanvasContext(context), score, layout);

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

/**
 * Whether this browser can put an image on the clipboard at all. Asked before
 * the control is rendered rather than before it is enabled: a button that can
 * never do anything is worse than no button.
 */
export function canCopyImage(): boolean {
  return typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function';
}

/**
 * Copies an image that is still being drawn.
 *
 * The promise, not the blob: a browser only honours a clipboard write that
 * belongs to a user gesture, and awaiting the drawing before asking would spend
 * that gesture. Handing the clipboard the unresolved image lets the ask happen
 * inside the click and the drawing finish afterwards.
 */
export async function copyImage(image: Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]);
}

/** Offers the image to the browser's downloads, under the given name. */
export function downloadImage(image: Blob, filename: string): void {
  const url = URL.createObjectURL(image);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  // The download is claimed synchronously by the click, but the URL is released
  // a task later regardless: revoking it in the same turn has been known to
  // race the browser to it.
  setTimeout(() => URL.revokeObjectURL(url));
}
