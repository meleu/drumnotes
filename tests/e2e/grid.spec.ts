import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { serialisePattern } from '../../src/core/codec.js';
import {
  ARTICULATIONS,
  BARS,
  STEPS_PER_BAR,
  TOTAL_STEPS,
  defaultPattern,
  withArticulation,
} from '../../src/core/pattern.js';

// Browser tests assert on DOM structure and counts, never pixels.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('renders every step of every bar as a button per instrument row', async ({ page }) => {
  for (const instrument of ['hihat', 'snare', 'kick']) {
    await expect(page.locator(`button[data-instrument="${instrument}"]`)).toHaveCount(TOTAL_STEPS);
  }
});

test('orders the rows hi-hat, snare, kick, matching staff height', async ({ page }) => {
  const names = page.locator('.bar').first().locator('.name');

  // Abbreviated so the label column costs the cells little width; the full name
  // is carried as the tooltip.
  await expect(names).toHaveText(['HH', 'SD', 'BD']);
  for (const [row, name] of ['Hi-hat', 'Snare', 'Kick'].entries()) {
    await expect(names.nth(row)).toHaveAttribute('title', name);
  }
});

test('labels the columns with the counting, once per bar', async ({ page }) => {
  const counts = page.locator('.bar').first().locator('.count');

  await expect(counts).toHaveCount(STEPS_PER_BAR);
  await expect(counts).toHaveText('1 e + a 2 e + a 3 e + a 4 e + a'.split(' '));
});

test('toggling a cell flips its aria-pressed value', async ({ page }) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);

  await expect(cell).toHaveAttribute('aria-pressed', 'false');

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
});

test('stacks the bar blocks when narrow and sits them side by side when wide', async ({ page }) => {
  const barTop = async (index: number) => {
    const box = await page.locator('.bar').nth(index).boundingBox();
    return box?.y ?? 0;
  };

  await page.setViewportSize({ width: 390, height: 800 });
  expect(await barTop(BARS - 1)).toBeGreaterThan(await barTop(0));

  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await barTop(BARS - 1)).toBe(await barTop(0));
});

test('labels the rows once when the bars sit side by side, once per bar when stacked', async ({
  page,
}) => {
  const later = page
    .locator('.bar')
    .nth(BARS - 1)
    .locator('.name');

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(later).toHaveText(['HH', 'SD', 'BD']);

  // Read off the bar beside it instead; the labels would only repeat.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(later.first()).toBeHidden();
});

test('mounts without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.reload();
  await expect(page.locator('button[data-instrument="kick"]').first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('marks an accented cell and leaves a plain one bare', async ({ page }) => {
  const step = defaultPattern().lanes.snare.indexOf('normal');
  const plain = defaultPattern().lanes.hihat.indexOf('normal');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(withArticulation(defaultPattern(), 'snare', step, 'accent'))],
  );
  await page.reload();

  // SMuFL articAccentAbove: the same mark the staff engraves, so grid and page
  // say one thing rather than two.
  await expect(
    page.locator(`button[data-instrument="snare"][data-step="${step}"] .mark`),
  ).toHaveText('\u{E4A0}');
  await expect(
    page.locator(`button[data-instrument="hihat"][data-step="${plain}"] .mark`),
  ).toBeEmpty();
});

test('marks a ghosted cell with the pair the staff brackets it in', async ({ page }) => {
  const step = defaultPattern().lanes.snare.indexOf('normal');
  const accented = defaultPattern().lanes.hihat.indexOf('normal');
  let pattern = withArticulation(defaultPattern(), 'snare', step, 'ghost');
  pattern = withArticulation(pattern, 'hihat', accented, 'accent');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(pattern)],
  );
  await page.reload();

  // SMuFL noteheadParenthesis: the parentheses of the page, as one glyph with
  // the head's own space left empty — which on a cell is the cell.
  await expect(
    page.locator(`button[data-instrument="snare"][data-step="${step}"] .mark`),
  ).toHaveText('\u{E0CE}');
  // And not the mark of the articulation beside it in the menu.
  await expect(
    page.locator(`button[data-instrument="hihat"][data-step="${accented}"] .mark`),
  ).toHaveText('\u{E4A0}');
});

test('marks a flammed cell with the grace note the staff draws before it', async ({ page }) => {
  const step = defaultPattern().lanes.snare.indexOf('normal');
  const ghosted = defaultPattern().lanes.hihat.indexOf('normal');
  let pattern = withArticulation(defaultPattern(), 'snare', step, 'flam');
  pattern = withArticulation(pattern, 'hihat', ghosted, 'ghost');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(pattern)],
  );
  await page.reload();

  // SMuFL graceNoteAppoggiaturaStemUp: the unslashed grace note of the page,
  // which is the whole of what a flam looks like written down.
  await expect(
    page.locator(`button[data-instrument="snare"][data-step="${step}"] .mark`),
  ).toHaveText('\u{E562}');
  // And distinguishable from the articulation beside it in the menu.
  await expect(
    page.locator(`button[data-instrument="hihat"][data-step="${ghosted}"] .mark`),
  ).toHaveText('\u{E0CE}');
});

test('marks a dragged cell with the beamed pair the staff draws before it', async ({ page }) => {
  const step = defaultPattern().lanes.snare.indexOf('normal');
  const flammed = defaultPattern().lanes.hihat.indexOf('normal');
  let pattern = withArticulation(defaultPattern(), 'snare', step, 'drag');
  pattern = withArticulation(pattern, 'hihat', flammed, 'flam');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(pattern)],
  );
  await page.reload();

  // SMuFL textBlackNoteFrac8thShortStem then textBlackNoteShortStem: the two
  // beamed notes of the page, composed as SMuFL beams a group — the first note
  // carries the beam, the second closes it.
  await expect(
    page.locator(`button[data-instrument="snare"][data-step="${step}"] .mark`),
  ).toHaveText('\u{E1F2}\u{E1F0}');
  // And distinguishable from the ornament beside it in the menu, which is the
  // one a drag is easiest to mistake for.
  await expect(
    page.locator(`button[data-instrument="hihat"][data-step="${flammed}"] .mark`),
  ).toHaveText('\u{E562}');
});

/* Each mark is set at its own size, because Bravura draws them at wildly
   different heights against one baseline. What no mark may do is outgrow the
   square it is drawn in — measured as ink, from the font's own metrics for the
   size the cell settled on, rather than off the box, which `line-height: 0`
   collapses to nothing. */
test('draws every mark small enough to fit the cell, at the narrowest layout', async ({ page }) => {
  // A phone, where the grid stacks its bars and the cells are at their
  // smallest: the size a two-character mark has to survive.
  await page.setViewportSize({ width: 320, height: 640 });
  const marked = ['accent', 'ghost', 'flam', 'drag'] as const;
  const pattern = marked.reduce(
    (next, articulation, index) => withArticulation(next, 'snare', index * 4, articulation),
    defaultPattern(),
  );
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(pattern)],
  );
  await page.reload();

  for (const [index, articulation] of marked.entries()) {
    const cell = page.locator(`button[data-instrument="snare"][data-step="${index * 4}"]`);
    await expect(cell).toHaveAttribute('data-articulation', articulation);

    const fits = await cell.evaluate((node) => {
      const mark = node.querySelector('.mark')!;
      const { font } = getComputedStyle(mark);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = font;
      const ink = context.measureText(mark.textContent ?? '');
      const box = node.getBoundingClientRect();
      return {
        width: ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight <= box.width,
        height: ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent <= box.height,
      };
    });
    expect(`${articulation}: ${JSON.stringify(fits)}`).toBe(
      `${articulation}: {"width":true,"height":true}`,
    );
  }
});

test('keeps an accented cell marked as the playhead lights its column', async ({ page }) => {
  const step = defaultPattern().lanes.snare.indexOf('normal');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(withArticulation(defaultPattern(), 'snare', step, 'accent'))],
  );
  await page.reload();

  const cell = page.locator(`button[data-instrument="snare"][data-step="${step}"]`);
  await expect(cell).toBeEnabled();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(cell).toHaveClass(/playing/);

  // A written cell keeps its own colour under the playhead, so the mark keeps
  // the one ground it was drawn to read against.
  await expect(cell.locator('.mark')).toHaveText('\u{E4A0}');
  const [markColour, cellColour] = await cell.evaluate((node) => [
    getComputedStyle(node.querySelector('.mark')!).color,
    getComputedStyle(node).backgroundColor,
  ]);
  expect(markColour).not.toBe(cellColour);
});

/* The one pixel test in the suite, and deliberately so: whether six marks can
   be told apart at the size a phone draws them is a claim about what reaches
   the screen, and no count of DOM nodes answers it. Compared as the share of a
   cell's pixels that differ — two marks that render identically, or as the same
   tofu box under a missing font, would differ in none. */
test('draws the six articulations as six distinguishable cells at phone size', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });

  // Six cells of one row, none of them the first of a beat: a beat's opening
  // cell is drawn differently on purpose, and would be told apart by that
  // rather than by what it holds.
  const steps = [1, 2, 3, 5, 6, 7];
  const pattern = ARTICULATIONS.reduce(
    (next, articulation, index) => withArticulation(next, 'snare', steps[index]!, articulation),
    defaultPattern(),
  );
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(pattern)],
  );
  await page.reload();

  const shots: string[] = [];
  for (const [index, articulation] of ARTICULATIONS.entries()) {
    const cell = page.locator(`button[data-instrument="snare"][data-step="${steps[index]!}"]`);
    await expect(cell).toHaveAttribute('data-articulation', articulation);
    shots.push((await cell.screenshot()).toString('base64'));
  }

  const differences = await page.evaluate(async (images) => {
    const shots = await Promise.all(
      images.map(async (image) => {
        const png = Uint8Array.from(atob(image), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      }),
    );

    /** The share of the cell the two are drawn differently over. Compared row
     *  by row over what they have in common, since a cell can land a pixel
     *  wider than its neighbour. */
    const apart = (one: ImageData, other: ImageData): number => {
      const width = Math.min(one.width, other.width);
      const height = Math.min(one.height, other.height);
      let differing = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const here = (y * one.width + x) * 4;
          const there = (y * other.width + x) * 4;
          // Well past antialiasing, so a fringe along one edge of a glyph is
          // not mistaken for a mark of its own.
          const differs = [0, 1, 2].some(
            (channel) => Math.abs(one.data[here + channel]! - other.data[there + channel]!) > 32,
          );
          if (differs) differing += 1;
        }
      }
      return differing / (width * height);
    };

    return shots.map((one) => shots.map((other) => apart(one, other)));
  }, shots);

  for (const [index, articulation] of ARTICULATIONS.entries()) {
    for (const [other, against] of ARTICULATIONS.entries()) {
      if (index === other) continue;
      expect(differences[index]![other]!, `${articulation} against ${against}`).toBeGreaterThan(
        0.05,
      );
    }
  }
});
