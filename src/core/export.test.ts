import { describe, expect, test } from 'vitest';

import { exportFilename } from './export.js';

describe('exportFilename', () => {
  test('names the file after the day it was exported', () => {
    expect(exportFilename(new Date(2026, 7, 8, 14, 30))).toBe('drumnotes-2026-08-08.png');
  });

  test('pads the month and the day, so names sort as dates', () => {
    expect(exportFilename(new Date(2026, 0, 3))).toBe('drumnotes-2026-01-03.png');
  });

  test('reads the local day, not the UTC one', () => {
    // Late enough that anywhere east of UTC has turned the page.
    const local = new Date(2026, 11, 31, 23, 30);

    expect(exportFilename(local)).toBe('drumnotes-2026-12-31.png');
  });
});
