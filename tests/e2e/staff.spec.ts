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

/**
 * The grace notes leading the first stroke, slot by slot.
 *
 * A grace note is drawn as a note inside the note it leads into, so the page's
 * own nesting says which heads are ornaments — and one slot is one element,
 * which is what makes "one group, one stem" a count rather than a measurement.
 */
async function graceSlotsOfFirstStroke(page: Page): Promise<{ glyphs: string[]; xs: number[] }[]> {
  return await page
    .locator(`${staff} .vf-stavenote`)
    .first()
    .locator('.vf-stavenote')
    .evaluateAll(
      (slots, wanted) =>
        slots.map((slot) => {
          // By glyph, as everywhere else: VexFlow draws a flag inside the
          // notehead group it belongs to, and a flag is not a head.
          const heads = [...slot.querySelectorAll('.vf-notehead text')].filter((head) =>
            wanted.includes(head.textContent ?? ''),
          );
          return {
            glyphs: heads.map((head) => head.textContent ?? ''),
            xs: heads.map((head) => Number(head.getAttribute('x'))),
          };
        }),
      Object.values(HEAD_GLYPHS) as string[],
    );
}

/** Stems drawn for the first stroke: its own, and one per grace slot. Beamed
 *  slots have theirs drawn with the beam, which is still inside the stroke. */
async function stemsOfFirstStroke(page: Page): Promise<number> {
  return await page.locator(`${staff} .vf-stavenote`).first().locator('.vf-stem').count();
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

/** Where the staves sit and how far the ink reaches, in the drawing's own
 *  coordinates — the ones every notehead's `x` is written in. */
async function drawingBounds(
  page: Page,
): Promise<{ staveLeft: number; staveRight: number; inkRight: number; pageWidth: number }> {
  return await page.evaluate((selector) => {
    const svg = document.querySelector(selector) as SVGSVGElement;
    const staves = [...svg.querySelectorAll('.vf-stave')].map((node) =>
      (node as unknown as SVGGraphicsElement).getBBox(),
    );
    // The root's box is the ink itself, whether or not the page has room for
    // it: anything drawn past the viewBox is cut off, and shows up here.
    const ink = (svg as unknown as SVGGraphicsElement).getBBox();
    return {
      staveLeft: Math.min(...staves.map((box) => box.x)),
      staveRight: Math.max(...staves.map((box) => box.x + box.width)),
      inkRight: ink.x + ink.width,
      pageWidth: svg.viewBox.baseVal.width,
    };
  }, staff);
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

test('leads two flams struck together with one grace group on one stem', async ({ page }) => {
  // Hi-hat and snare both flammed on the same step: their grace hits sound at
  // the same moment, so the page has to show one gesture — a chord on a single
  // stem — and not two grace notes implying a sequence nobody plays.
  const struck = patternWith({ hihat: [0], snare: [0] });
  const pattern = withArticulation(
    withArticulation(struck, 'hihat', 0, 'flam'),
    'snare',
    0,
    'flam',
  );
  await load(page, pattern);

  const slots = await graceSlotsOfFirstStroke(page);
  expect(slots).toHaveLength(1);
  expect(slots[0]!.glyphs.toSorted()).toEqual([HEAD_GLYPHS.cross, HEAD_GLYPHS.normal].toSorted());
  // Both heads set down at one x, which is what sharing a stem looks like.
  expect(new Set(slots[0]!.xs).size).toBe(1);
  // The stroke's own stem and the grace group's, and nothing else.
  expect(await stemsOfFirstStroke(page)).toBe(2);
});

test('lines a flam up with the second of a drag it is struck with', async ({ page }) => {
  // A dragged hi-hat leads by two slots and a flammed snare by one: the drag's
  // first grace note stands alone, and the two share the slot after it.
  const struck = patternWith({ hihat: [0], snare: [0] });
  const pattern = withArticulation(
    withArticulation(struck, 'hihat', 0, 'drag'),
    'snare',
    0,
    'flam',
  );
  await load(page, pattern);

  const slots = await graceSlotsOfFirstStroke(page);
  expect(slots).toHaveLength(2);
  const [first, second] = slots;
  expect(first!.glyphs).toEqual([HEAD_GLYPHS.cross]);
  expect(second!.glyphs.toSorted()).toEqual([HEAD_GLYPHS.cross, HEAD_GLYPHS.normal].toSorted());
  expect(new Set(second!.xs).size).toBe(1);
  // Earliest first: the slot sounding two leads early is drawn furthest left.
  expect(first!.xs[0]!).toBeLessThan(second!.xs[0]!);

  // One group of two slots, beamed: the stroke's stem plus one for each slot.
  expect(await stemsOfFirstStroke(page)).toBe(3);
  await expect(page.locator(beams)).toHaveCount(1);
});

test('draws no grace note where nothing is ornamented', async ({ page }) => {
  await load(page, withArticulation(patternWith({ snare: [0] }), 'snare', 0, 'accent'));

  expect(await heads(page)).toHaveLength(1);
});

test('keeps a measure of sixteen ornamented sixteenths on its own stave', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  // A drag on every sixteenth — three noteheads a step, the densest measure the
  // vocabulary can write — on a phone, where the staff has least room to write
  // it in. Cramped is allowed; drawn past the barline, off the page, or not at
  // all is not.
  await page.setViewportSize({ width: 390, height: 900 });
  const dragged = [...Array(TOTAL_STEPS).keys()].reduce(
    (pattern, step) => withArticulation(pattern, 'hihat', step, 'drag'),
    emptyPattern(),
  );
  await load(page, dragged);

  const drawn = await heads(page);
  expect(drawn).toHaveLength(TOTAL_STEPS * 3);

  // Every measure is on a stave of its own at this width, so one span holds
  // them all: no notehead outside the lines it belongs to, grace notes least of
  // all — they are drawn ahead of their stroke and so are the first to fall off
  // the front of a measure.
  const { staveLeft, staveRight, inkRight, pageWidth } = await drawingBounds(page);
  for (const { x } of drawn) {
    expect(x).toBeGreaterThanOrEqual(staveLeft);
    expect(x).toBeLessThanOrEqual(staveRight);
  }
  // And nothing at all drawn past the edge of the page, where it would simply
  // be cut off.
  expect(inkRight).toBeLessThanOrEqual(pageWidth);

  expect(errors).toEqual([]);
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
