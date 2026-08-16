import { readFile } from 'node:fs/promises';

import type { Download, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { serialisePattern } from '../../src/core/codec.js';
import { EXPORT_SCALE, EXPORT_WIDTH, exportFilename } from '../../src/core/export.js';
import type { Pattern } from '../../src/core/pattern.js';
import { BARS, emptyPattern, toggleStep, withArticulation } from '../../src/core/pattern.js';

// Browser tests assert on DOM structure and counts, never pixels — except here:
// the image's size and background opacity are claims about the file handed over,
// checkable only by looking at it.

const sheet = '.sheet svg';
const download = 'button[data-export="download"]';
const copy = 'button[data-export="copy"]';
const transport = '.transport';
const shading = '.playhead rect';

/** The eight bytes a PNG opens with. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function save(download: Download): Promise<Buffer> {
  const path = await download.path();
  return await readFile(path);
}

async function exportPng(page: Page): Promise<{ file: Download; bytes: Buffer }> {
  const started = page.waitForEvent('download');
  await page.locator(download).click();
  const file = await started;
  return { file, bytes: await save(file) };
}

/** The exported file read back through the browser that wrote it: size, corner
 *  colour, amount of ink. */
async function inspect(bytes: Buffer, page: Page): Promise<Image> {
  return await page.evaluate(async (base64) => {
    const png = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);

    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let ink = 0;
    for (let pixel = 0; pixel < data.length; pixel += 4) {
      if (data[pixel]! < 128 && data[pixel + 1]! < 128 && data[pixel + 2]! < 128) ink += 1;
    }

    return {
      width: bitmap.width,
      height: bitmap.height,
      corner: [...context.getImageData(0, 0, 1, 1).data],
      ink,
    };
  }, bytes.toString('base64'));
}

interface Image {
  readonly width: number;
  readonly height: number;
  readonly corner: number[];
  /** Dark pixels — not what the notation looks like, but whether there is any:
   *  a canvas hands VexFlow whatever fill style it was left in, so an export can
   *  be structurally perfect and blank. */
  readonly ink: number;
}

async function systemCount(page: Page): Promise<number> {
  const staves = page.locator(`${sheet} .vf-stave`);
  await expect(staves).toHaveCount(BARS);

  const tops = await staves.evaluateAll((nodes) =>
    nodes.map((node) => Math.round((node as SVGGraphicsElement).getBBox().y)),
  );
  return new Set(tops).size;
}

async function screenHeight(page: Page): Promise<number> {
  const box = await page.locator(sheet).getAttribute('viewBox');
  return Number(box!.trim().split(/\s+/)[3]);
}

async function load(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.waitForSelector(sheet);
}

const WIDE = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 900 };

/** Rewrites the stored groove and reloads onto it, rather than clicking it in
 *  cell by cell. */
async function rewrite(page: Page, pattern: Pattern): Promise<void> {
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, serialisePattern(pattern)],
  );
  await page.reload();
  await page.waitForSelector(sheet);
}

/** Glyphs the screen draws — noteheads, marks, brackets. What the picture is
 *  held against: same drawing, so a mark the staff gains the file must too. */
async function screenGlyphs(page: Page): Promise<number> {
  return await page.locator(`${sheet} text`).count();
}

test('downloads a non-empty PNG of the notation', async ({ page }) => {
  await page.goto('/');

  const { bytes } = await exportPng(page);

  expect(bytes.byteLength).toBeGreaterThan(0);
  expect(bytes.subarray(0, PNG_SIGNATURE.byteLength)).toEqual(PNG_SIGNATURE);
});

test('exports the same single-system image whatever the viewport is doing', async ({ page }) => {
  await load(page, WIDE);

  // At this width the screen draws one system too, so it has the export's shape
  // at 1× rather than 2×.
  expect(await systemCount(page)).toBe(1);
  const oneSystem = await screenHeight(page);

  const wide = await inspect((await exportPng(page)).bytes, page);
  expect(wide.width).toBe(EXPORT_WIDTH * EXPORT_SCALE);
  expect(wide.height).toBe(oneSystem * EXPORT_SCALE);

  // The screen now wraps to a system per bar; the export must not follow.
  await page.setViewportSize(PHONE);
  await expect.poll(async () => await systemCount(page)).toBe(BARS);
  expect(await screenHeight(page)).toBeGreaterThan(oneSystem);

  expect(await inspect((await exportPng(page)).bytes, page)).toEqual(wide);
});

test('paints the notation onto opaque light paper', async ({ page }) => {
  await load(page, WIDE);

  const { corner } = await inspect((await exportPng(page)).bytes, page);
  const [red, green, blue, alpha] = corner as [number, number, number, number];

  // Opaque, so not a hole on a dark background; light enough for black heads.
  expect(alpha).toBe(255);
  expect(Math.min(red, green, blue)).toBeGreaterThan(200);
});

test('actually draws the notation, and redraws it after an edit', async ({ page }) => {
  await load(page, WIDE);

  const before = await inspect((await exportPng(page)).bytes, page);
  expect(before.ink).toBeGreaterThan(0);

  // One more notehead, one more patch of ink: the export follows the pattern —
  // and has ink at all.
  await page.locator('button[data-instrument="snare"][data-step="1"]').click();

  const after = await inspect((await exportPng(page)).bytes, page);
  expect(after.ink).toBeGreaterThan(before.ink);
});

test('carries every mark the screen draws', async ({ page }) => {
  await load(page, WIDE);

  // One plain snare a beat: every mark below is this groove, one cell apart.
  const plain = [0, 4, 8, 12].reduce(
    (pattern, step) => toggleStep(pattern, 'snare', step),
    emptyPattern(),
  );
  await rewrite(page, plain);

  const bare = {
    glyphs: await screenGlyphs(page),
    ink: (await inspect((await exportPng(page)).bytes, page)).ink,
  };

  // Every mark, one at a time: accent on the stroke, ghost brackets round a
  // head, grace notes of both ornaments.
  for (const [index, articulation] of (['accent', 'ghost', 'flam', 'drag'] as const).entries()) {
    await rewrite(page, withArticulation(plain, 'snare', index * 4, articulation));

    const drawn = await screenGlyphs(page);
    const { ink } = await inspect((await exportPng(page)).bytes, page);

    // On the staff, so in the file: no mark only the screen can engrave.
    expect(drawn, `${articulation} on the staff`).toBeGreaterThan(bare.glyphs);
    expect(ink, `${articulation} in the picture`).toBeGreaterThan(bare.ink);
  }
});

test('leaves the playhead out of the export', async ({ page }) => {
  await load(page, WIDE);

  const stopped = (await exportPng(page)).bytes;

  await expect(page.locator(transport)).toBeEnabled();
  await page.locator(transport).click();
  // The staff shades a measure and the export is unchanged byte for byte: the
  // shading was never part of the drawing.
  await expect(page.locator(shading)).toHaveCount(1);

  expect((await exportPng(page)).bytes).toEqual(stopped);
});

test('names the downloaded file after today', async ({ page }) => {
  await load(page, WIDE);

  const { file } = await exportPng(page);

  expect(file.suggestedFilename()).toBe(exportFilename(new Date()));
});

test.describe('the copy affordance', () => {
  test('is offered when the browser can put an image on the clipboard', async ({ page }) => {
    await load(page, WIDE);

    await expect(page.locator(copy)).toHaveCount(1);
  });

  test('writes the image to the clipboard and says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-write']);
    await load(page, WIDE);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.locator(copy).click();

    // The confirmation waits on the write resolving, so this covers the round
    // trip.
    await expect(page.locator(copy)).toHaveText('Copied');
    expect(errors).toEqual([]);
  });

  test('is absent, not merely disabled, when the browser cannot', async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'ClipboardItem');
    });
    await load(page, WIDE);

    // The download is still there, so the copy control went away rather than the
    // component failing to render.
    await expect(page.locator(copy)).toHaveCount(0);
    await expect(page.locator(download)).toHaveCount(1);
  });
});
