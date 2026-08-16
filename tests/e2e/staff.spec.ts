import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { serialisePattern } from '../../src/core/codec.js';
import type { InstrumentId, Pattern } from '../../src/core/pattern.js';
import {
  BARS,
  BEATS_PER_BAR,
  TOTAL_STEPS,
  defaultPattern,
  emptyPattern,
  toggleStep,
  withArticulation,
} from '../../src/core/pattern.js';

// Browser tests assert on DOM structure and counts, never pixels — except for
// which side of the staff a mark landed on, which is a fact about the page and
// nothing else.

const staff = '.sheet svg';
const noteheads = `${staff} .vf-notehead`;
/** VexFlow gives each beam and flag its own class. */
const beams = `${staff} .vf-beam`;
const flags = `${staff} .vf-flag`;

/** A pattern from absolute step indices. */
function patternWith(hits: Partial<Record<InstrumentId, readonly number[]>>): Pattern {
  return Object.entries(hits).reduce(
    (pattern, [id, steps]) =>
      steps.reduce((next, step) => toggleStep(next, id as InstrumentId, step), pattern),
    emptyPattern(),
  );
}

/** Loads the app on a pattern, without clicking it in cell by cell. */
async function load(page: Page, pattern: Pattern): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(pattern)],
  );
  await page.reload();
  await page.waitForSelector(staff);
}

/** Augmentation dots on the staff. The font draws one as the SMuFL glyph below,
 *  so counting them is structural, not pixels. */
const AUGMENTATION_DOT = '\u{E1E7}';

async function augmentationDots(page: Page): Promise<number> {
  return await page
    .locator(`${staff} g.vf-stavenote text`)
    .evaluateAll(
      (nodes, glyph) => nodes.filter((node) => node.textContent === glyph).length,
      AUGMENTATION_DOT,
    );
}

/** SMuFL articAccentAbove and articAccentBelow — one mark, drawn as the mirror
 *  of itself depending on which side of the stroke it sits. */
const ACCENT_GLYPHS = ['\u{E4A0}', '\u{E4A1}'];

/** SMuFL noteheadParenthesisLeft and noteheadParenthesisRight — the pair a
 *  ghosted head is bracketed with, drawn one either side of it. */
const PARENTHESIS_GLYPHS = ['\u{E0F5}', '\u{E0F6}'];

interface Ink {
  top: number;
  bottom: number;
}

/**
 * Where a group of paths draws, in the page's own coordinates. `getBBox` bounds
 * it in the element's own space, so it has to be put through the transform that
 * places that space on the page.
 */
async function inkOf(page: Page, selector: string): Promise<Ink[]> {
  return await page.locator(selector).evaluateAll((nodes) =>
    nodes.map((element) => {
      const node = element as unknown as SVGGraphicsElement;
      const box = node.getBBox();
      const ctm = node.getScreenCTM();
      if (ctm === null) throw new Error('element is not rendered');
      const top = new DOMPoint(box.x, box.y).matrixTransform(ctm).y;
      const bottom = new DOMPoint(box.x, box.y + box.height).matrixTransform(ctm).y;
      return { top: Math.min(top, bottom), bottom: Math.max(top, bottom) };
    }),
  );
}

/** Where a glyph is set down on the page: its origin, not its box. */
interface Anchor {
  x: number;
  y: number;
}

/**
 * Where each of a set of glyphs is drawn, so one mark can be told from another
 * and above from below. A glyph's origin rather than its box: a text node's box
 * is the whole font's ascent and descent, which for a mark this small says
 * almost nothing about where the mark is.
 */
async function glyphAnchors(page: Page, glyphs: readonly string[]): Promise<Anchor[]> {
  return await page.locator(`${staff} text`).evaluateAll(
    (nodes, wanted) =>
      nodes
        .filter((node) => wanted.includes(node.textContent ?? ''))
        .map((element) => {
          const node = element as unknown as SVGGraphicsElement;
          const ctm = node.getScreenCTM();
          if (ctm === null) throw new Error('glyph is not rendered');
          const at = new DOMPoint(Number(node.getAttribute('x')), Number(node.getAttribute('y')));
          const { x, y } = at.matrixTransform(ctm);
          return { x, y };
        }),
    [...glyphs],
  );
}

/** SMuFL noteheadBlack and noteheadXBlack — a drum's head and a cymbal's. */
const HEAD_GLYPHS = { normal: '\u{E0A4}', cross: '\u{E0A9}' } as const;

/**
 * Every notehead drawn on the page, grace notes included: the shape it was
 * drawn with and where it was set down. A grace note is a notehead like any
 * other — smaller, and to the left of the stroke it leads into. Picked out by
 * glyph, since VexFlow draws a rest as a notehead too.
 */
async function heads(page: Page): Promise<{ glyph: string; x: number; y: number }[]> {
  return await page.locator(`${staff} .vf-notehead text`).evaluateAll(
    (nodes, wanted) =>
      nodes
        .filter((node) => wanted.includes(node.textContent ?? ''))
        .map((node) => ({
          glyph: node.textContent ?? '',
          x: Number(node.getAttribute('x')),
          y: Number(node.getAttribute('y')),
        })),
    Object.values(HEAD_GLYPHS) as string[],
  );
}

/** Where each accent sits vertically, so above and below can be told apart. */
async function accentBaselines(page: Page): Promise<number[]> {
  return (await glyphAnchors(page, ACCENT_GLYPHS)).map(({ y }) => y);
}

/** Every glyph drawn for the first stroke on the page, where it was set down.
 *  Stave coordinates, which is all a comparison within one stroke needs. */
async function glyphsOfFirstStroke(page: Page): Promise<{ glyph: string; x: number; y: number }[]> {
  return await page
    .locator(`${staff} .vf-stavenote`)
    .first()
    .locator('text')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        glyph: node.textContent ?? '',
        x: Number(node.getAttribute('x')),
        y: Number(node.getAttribute('y')),
      })),
    );
}

/** Measure tops, deduped into systems. */
async function systemCount(page: Page): Promise<number> {
  const staves = page.locator(`${staff} .vf-stave`);
  await expect(staves).toHaveCount(BARS);

  const tops = await staves.evaluateAll((nodes) =>
    nodes.map((node) => Math.round((node as SVGGraphicsElement).getBBox().y)),
  );
  return new Set(tops).size;
}

test('draws no staff at all until the music font has loaded', async ({ page }) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.woff2', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'commit' });

  // The grid is usable while the notation still waits on its font.
  await expect(page.locator('button[data-instrument="kick"]').first()).toBeVisible();
  await expect(page.locator(staff)).toHaveCount(0);

  release();
  await expect(page.locator(staff)).toHaveCount(1);
});

test.describe('once the font has loaded', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.waitForSelector(staff);
  });

  test('toggling a cell changes the number of noteheads drawn', async ({ page }) => {
    const before = await page.locator(noteheads).count();
    const silent = defaultPattern().lanes.snare.indexOf('empty');
    const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);

    await cell.click();
    await expect(page.locator(noteheads)).toHaveCount(before + 1);

    await cell.click();
    await expect(page.locator(noteheads)).toHaveCount(before);
  });

  test('opens every system with a percussion clef and only the first bar with a time signature', async ({
    page,
  }) => {
    await expect(page.locator(`${staff} .vf-clef`)).toHaveCount(await systemCount(page));
    await expect(page.locator(`${staff} .vf-timesignature`)).toHaveCount(1);
  });

  test('keeps the grid entirely above the staff', async ({ page }) => {
    const order = await page.evaluate(() => {
      const grid = document.querySelector('.grid')!;
      const notation = document.querySelector('.staff')!;
      return {
        // DOCUMENT_POSITION_FOLLOWING: the staff comes after the grid.
        documentOrder: grid.compareDocumentPosition(notation) & Node.DOCUMENT_POSITION_FOLLOWING,
        gridBottom: grid.getBoundingClientRect().bottom,
        staffTop: notation.getBoundingClientRect().top,
      };
    });

    expect(order.documentOrder).toBeTruthy();
    expect(order.staffTop).toBeGreaterThanOrEqual(order.gridBottom);
  });

  test('puts both bars on one system when wide and one per system when narrow', async ({
    page,
  }) => {
    expect(await systemCount(page)).toBe(1);

    await page.setViewportSize({ width: 390, height: 900 });
    await expect
      .poll(async () => await systemCount(page), { message: 'systems after narrowing' })
      .toBe(BARS);
  });

  test('renders the staff without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.reload();
    await page.waitForSelector(noteheads);

    expect(errors).toEqual([]);
  });

  test('beams a straight sixteenth hi-hat line instead of flagging it', async ({ page }) => {
    await load(page, patternWith({ hihat: [...Array(TOTAL_STEPS).keys()] }));

    // One beam per beat, nothing left flagged.
    await expect(page.locator(beams)).toHaveCount(BARS * BEATS_PER_BAR);
    await expect(page.locator(flags)).toHaveCount(0);
  });

  test('leaves a lone flagged note its flag', async ({ page }) => {
    // A lone hi-hat on the second sixteenth is `16r 8.`: one flagged note with
    // nothing to beam it to.
    await load(page, patternWith({ hihat: [1] }));

    await expect(page.locator(flags)).toHaveCount(1);
    await expect(page.locator(beams)).toHaveCount(0);
  });

  test('draws an augmentation dot for a dotted value, and fills the measure', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    expect(await augmentationDots(page)).toBe(0);

    // The feet play nothing on beat 2, so a kick on that beat's last sixteenth
    // follows three silent ones: a dotted-eighth rest — the shortest route from
    // the default groove to a dotted value.
    await page.locator('button[data-instrument="kick"][data-step="7"]').click();

    await expect.poll(async () => await augmentationDots(page)).toBe(1);
    // A dot drawn but not counted leaves the measure short and the voice
    // rejected, so a clean console is half this test.
    expect(errors).toEqual([]);
  });
});

test('engraves no accent on a groove that has none', async ({ page }) => {
  await load(page, patternWith({ hihat: [0, 4], snare: [4], kick: [0] }));

  expect(await accentBaselines(page)).toEqual([]);
});

test('engraves one accent per accented stroke, however many heads share it', async ({ page }) => {
  // Hi-hat and snare struck together on step 4, the snare accented: one stem,
  // one mark. A second, unaccompanied accent on step 8.
  let pattern = patternWith({ hihat: [0, 4, 8], snare: [4] });
  pattern = withArticulation(pattern, 'snare', 4, 'accent');
  pattern = withArticulation(pattern, 'hihat', 8, 'accent');
  await load(page, pattern);

  expect(await accentBaselines(page)).toHaveLength(2);
});

test('engraves no parentheses on a groove with no ghost note', async ({ page }) => {
  const pattern = patternWith({ hihat: [0, 4], snare: [4] });
  await load(page, withArticulation(pattern, 'snare', 4, 'accent'));

  expect(await glyphAnchors(page, PARENTHESIS_GLYPHS)).toEqual([]);
});

test('brackets the ghosted head only, leaving the rest of its stroke bare', async ({ page }) => {
  // Hi-hat and snare struck together, the snare ghosted: unlike an accent, the
  // mark names its own drum, so it goes round one head and not round the stem.
  await load(page, withArticulation(patternWith({ hihat: [0], snare: [0] }), 'snare', 0, 'ghost'));

  const stroke = await glyphsOfFirstStroke(page);
  const brackets = stroke.filter(({ glyph }) => PARENTHESIS_GLYPHS.includes(glyph));
  const heads = stroke.filter(({ glyph }) => !PARENTHESIS_GLYPHS.includes(glyph));

  expect(heads).toHaveLength(2);
  expect(brackets).toHaveLength(2);

  // The snare sits lower on the staff than the hi-hat, so the head further down
  // the page is the one the brackets have to be bound to.
  const ghosted = heads.reduce((lowest, head) => (head.y > lowest.y ? head : lowest));
  // One either side of that head, which is what makes them read as parentheses
  // round it rather than as two marks that happen to be nearby.
  const [left, right] = brackets.map(({ x }) => x).sort((a, b) => a - b);
  expect(left!).toBeLessThan(ghosted.x);
  expect(right!).toBeGreaterThan(ghosted.x);
  for (const bracket of brackets) expect(bracket.y).toBe(ghosted.y);
});

test("draws a grace note before a flammed stroke, at its own drum's position", async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  // Hi-hat and snare struck together, the snare flammed: one head more than the
  // stroke has, and it is the snare's own — same line, same shape, drawn before.
  const stroke = patternWith({ hihat: [0], snare: [0] });
  await load(page, withArticulation(stroke, 'snare', 0, 'flam'));

  const drawn = await heads(page);
  expect(drawn).toHaveLength(3);

  const snareHeads = drawn.filter(({ glyph }) => glyph === HEAD_GLYPHS.normal);
  expect(snareHeads).toHaveLength(2);
  const [grace, main] = snareHeads.toSorted((a, b) => a.x - b.x);
  expect(grace!.y).toBe(main!.y);
  expect(grace!.x).toBeLessThan(main!.x);

  // A grace note steals no time, so the voice still fills its measure — which
  // VexFlow would refuse, loudly, if it did not.
  expect(errors).toEqual([]);
});

test("draws a flammed cymbal's grace note with the cymbal's own notehead", async ({ page }) => {
  await load(page, withArticulation(patternWith({ hihat: [0] }), 'hihat', 0, 'flam'));

  const drawn = await heads(page);
  expect(drawn.map(({ glyph }) => glyph)).toEqual([HEAD_GLYPHS.cross, HEAD_GLYPHS.cross]);
  expect(drawn.toSorted((a, b) => a.x - b.x)[0]!.y).toBe(drawn[0]!.y);
});

test('draws two beamed grace notes before a dragged stroke', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  // A lone quarter note in the measure, so the only beam the page can carry is
  // the one joining the grace notes.
  await load(page, withArticulation(patternWith({ snare: [0] }), 'snare', 0, 'drag'));

  const drawn = await heads(page);
  expect(drawn).toHaveLength(3);
  const [first, second, main] = drawn.toSorted((a, b) => a.x - b.x);
  // Both grace notes on the snare's own line, before the hit they lead into.
  for (const grace of [first!, second!]) {
    expect(grace.glyph).toBe(HEAD_GLYPHS.normal);
    expect(grace.y).toBe(main!.y);
    expect(grace.x).toBeLessThan(main!.x);
  }
  expect(first!.x).toBeLessThan(second!.x);

  // Beamed, not flagged: which is what tells a drag from a flam on the page.
  await expect(page.locator(beams)).toHaveCount(1);
  await expect(page.locator(flags)).toHaveCount(0);

  // Grace notes steal no time here either, however many of them there are.
  expect(errors).toEqual([]);
});

test('beams a drag where a flam is left with a single grace note', async ({ page }) => {
  await load(page, withArticulation(patternWith({ snare: [0] }), 'snare', 0, 'flam'));

  expect(await heads(page)).toHaveLength(2);
  await expect(page.locator(beams)).toHaveCount(0);
});

test('draws no grace note where nothing is ornamented', async ({ page }) => {
  await load(page, withArticulation(patternWith({ snare: [0] }), 'snare', 0, 'accent'));

  expect(await heads(page)).toHaveLength(1);
});

test('engraves the hands above the staff and the feet below it', async ({ page }) => {
  /** The first system's five lines, in the same coordinates as the accents. */
  const staveEdges = async (): Promise<Ink> => (await inkOf(page, `${staff} .vf-stave`))[0]!;

  await load(page, withArticulation(patternWith({ hihat: [0] }), 'hihat', 0, 'accent'));
  const [hands] = await accentBaselines(page);
  const handsStave = await staveEdges();

  await load(page, withArticulation(patternWith({ kick: [0] }), 'kick', 0, 'accent'));
  const [feet] = await accentBaselines(page);
  const feetStave = await staveEdges();

  expect(hands!).toBeLessThan(handsStave.top);
  expect(feet!).toBeGreaterThan(feetStave.bottom);
});
