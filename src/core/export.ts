/** Pure half of exporting: filename and size. Browser half: `adapters/export.ts`. */

/** Logical export width, points. Same on phone and desktop, so shared grooves
 *  are comparable pictures, not pictures of screens. */
export const EXPORT_WIDTH = 1200;

/** Pixels per point; 2× keeps a notehead crisp at full size. */
export const EXPORT_SCALE = 2;

/** Download filename. Dated so two takes are told apart, in local time so the
 *  date matches the exporter's own calendar. */
export function exportFilename(now: Date): string {
  const parts = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  return `drumnotes-${parts.map(pad).join('-')}.png`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
