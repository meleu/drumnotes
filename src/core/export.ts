/**
 * The pure half of exporting: what the exported image is called, and how big it
 * is drawn. No canvas, no notation library — the browser-facing half lives in
 * `adapters/export.ts`.
 */

/**
 * The logical width every export is drawn at, in points — the same width from a
 * phone as from a desktop, so two people sharing their grooves are sharing
 * comparable pictures rather than pictures of their screens.
 */
export const EXPORT_WIDTH = 1200;

/**
 * How much bigger the pixels are than the points. Drawing at 2× and letting the
 * image carry the extra resolution is what keeps a notehead crisp when the PNG
 * is opened at full size or dropped into a document.
 */
export const EXPORT_SCALE = 2;

/**
 * What the browser offers to save the image as. Dated, because the file lands
 * in a downloads folder next to every other one, and the day it was written is
 * the thing that tells two takes of the same groove apart.
 *
 * The local day, not the UTC one: the name has to match the calendar the person
 * exporting it is looking at.
 */
export function exportFilename(now: Date): string {
  const parts = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  return `drumnotes-${parts.map(pad).join('-')}.png`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
