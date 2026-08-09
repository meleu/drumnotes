/**
 * The pure half of exporting: filename and drawing size. No canvas, no notation
 * lib — the browser-facing half is in `adapters/export.ts`.
 */

/** Logical export width in points. Same from a phone as from a desktop, so
 *  shared grooves are comparable pictures, not pictures of screens. */
export const EXPORT_WIDTH = 1200;

/** Pixels per point. Drawing at 2× keeps a notehead crisp at full size. */
export const EXPORT_SCALE = 2;

/**
 * What the browser offers to save the image as. Dated, since the file lands
 * among every other download and the day tells two takes apart. Local day, not
 * UTC: it has to match the exporter's own calendar.
 */
export function exportFilename(now: Date): string {
  const parts = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  return `drumnotes-${parts.map(pad).join('-')}.png`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
