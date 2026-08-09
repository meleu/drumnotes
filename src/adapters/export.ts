/**
 * Notation → picture → the person who asked for it.
 *
 * Calls the same `drawScore` the screen does, from the same `Score`, differing
 * only in context and layout — no second engraver to disagree with the first.
 * The layout is fixed rather than measured (one system, one width), so phone
 * and desktop export the same picture. Playhead shading is a screen-only
 * overlay, so the export carries no trace of it without removing anything.
 */

import { CanvasContext } from 'vexflow/core';

import { EXPORT_SCALE, EXPORT_WIDTH } from '../core/export.js';
import type { Score } from '../core/score.js';
import type { StaffLayout } from './notation.js';
import { drawScore, loadNotationFont, staffSize } from './notation.js';

/** Opaque, and light: the notation is black ink and needs paper behind it. */
const PAPER = '#ffffff';
/** Stated, not assumed: VexFlow only overrides the canvas fill style where an
 *  element asks for its own colour — otherwise it is white ink on white paper. */
const INK = '#000000';

/** One system, fixed width, whatever the viewport says. */
function exportLayout(score: Score): StaffLayout {
  return { width: EXPORT_WIDTH, measuresPerSystem: score.measures.length };
}

/**
 * Draws the score to an off-document canvas and returns a PNG. Drawn at
 * `EXPORT_SCALE`× its logical size: same points, more pixels, so it stands up
 * to being opened at full size.
 */
export async function renderScorePng(score: Score): Promise<Blob> {
  // Glyphs measured against a missing font lay out at the wrong widths, and an
  // image cannot be corrected a moment later.
  await loadNotationFont();

  const layout = exportLayout(score);
  const { width, height } = staffSize(score, layout);

  const canvas = document.createElement('canvas');
  canvas.width = width * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw to a canvas.');

  // Scaled first, so everything after — paper included — is in the points
  // `drawScore` lays the staff out in.
  context.scale(EXPORT_SCALE, EXPORT_SCALE);
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);
  context.fillStyle = INK;
  context.strokeStyle = INK;

  // Margins are the ones `staffSize` and `drawScore` already agree on.
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

/** Whether this browser can put an image on the clipboard. Decides whether the
 *  control exists, not whether it is enabled. */
export function canCopyImage(): boolean {
  return typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function';
}

/**
 * Copies an image still being drawn. Takes the promise, not the blob: a
 * clipboard write is only honoured inside a user gesture, and awaiting first
 * would spend it.
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

  // Released a task later: revoking in the same turn can race the browser.
  setTimeout(() => URL.revokeObjectURL(url));
}
