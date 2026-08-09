import { readFile } from 'node:fs/promises';

import type { Download, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { EXPORT_SCALE, EXPORT_WIDTH, exportFilename } from '../../src/core/export.js';
import { BARS } from '../../src/core/pattern.js';

// Browser tests assert on DOM structure and counts, never on pixels — with one
// deliberate exception here. The exported image's size and the opacity of its
// background are claims about the file the app hands over, so they can only be
// checked by looking at that file.

const sheet = '.sheet svg';
const download = 'button[data-export="download"]';
const copy = 'button[data-export="copy"]';
const transport = '.transport';
const shading = '.playhead rect';

/** The eight bytes every PNG opens with. */
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

/**
 * What the exported file actually is, read back through the browser that wrote
 * it: how big the image is, what colour its top-left corner is, and how much of
 * it is ink.
 */
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
  /** The top-left pixel, as red, green, blue, alpha. */
  readonly corner: number[];
  /** How many pixels are dark. Not what the notation looks like — whether
   *  there is any. A canvas hands VexFlow whatever fill style it was left in,
   *  so an export can come out structurally perfect and entirely blank. */
  readonly ink: number;
}

/** How many systems the staff on screen is laid out over. */
async function systemCount(page: Page): Promise<number> {
  const staves = page.locator(`${sheet} .vf-stave`);
  await expect(staves).toHaveCount(BARS);

  const tops = await staves.evaluateAll((nodes) =>
    nodes.map((node) => Math.round((node as SVGGraphicsElement).getBBox().y)),
  );
  return new Set(tops).size;
}

/** The height, in points, of the drawing currently on screen. */
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

test('downloads a non-empty PNG of the notation', async ({ page }) => {
  await page.goto('/');

  const { bytes } = await exportPng(page);

  expect(bytes.byteLength).toBeGreaterThan(0);
  expect(bytes.subarray(0, PNG_SIGNATURE.byteLength)).toEqual(PNG_SIGNATURE);
});

test('exports the same single-system image whatever the viewport is doing', async ({ page }) => {
  await load(page, WIDE);

  // At this width the screen is drawing one system too, so its own drawing is
  // the shape the export should have — at 1× rather than at 2×.
  expect(await systemCount(page)).toBe(1);
  const oneSystem = await screenHeight(page);

  const wide = await inspect((await exportPng(page)).bytes, page);
  expect(wide.width).toBe(EXPORT_WIDTH * EXPORT_SCALE);
  expect(wide.height).toBe(oneSystem * EXPORT_SCALE);

  // Now the screen wraps to a system per bar. The export must not follow it.
  await page.setViewportSize(PHONE);
  await expect.poll(async () => await systemCount(page)).toBe(BARS);
  expect(await screenHeight(page)).toBeGreaterThan(oneSystem);

  expect(await inspect((await exportPng(page)).bytes, page)).toEqual(wide);
});

test('paints the notation onto opaque light paper', async ({ page }) => {
  await load(page, WIDE);

  const { corner } = await inspect((await exportPng(page)).bytes, page);
  const [red, green, blue, alpha] = corner as [number, number, number, number];

  // Fully opaque, so the image does not read as a hole when dropped onto a dark
  // background, and light enough that black noteheads sit on it.
  expect(alpha).toBe(255);
  expect(Math.min(red, green, blue)).toBeGreaterThan(200);
});

test('actually draws the notation, and redraws it after an edit', async ({ page }) => {
  await load(page, WIDE);

  const before = await inspect((await exportPng(page)).bytes, page);
  expect(before.ink).toBeGreaterThan(0);

  // One more notehead is one more patch of ink. This is the export following
  // the pattern, and — more bluntly — the export having ink at all.
  await page.locator('button[data-instrument="snare"][data-step="1"]').click();

  const after = await inspect((await exportPng(page)).bytes, page);
  expect(after.ink).toBeGreaterThan(before.ink);
});

test('leaves the playhead out of the export', async ({ page }) => {
  await load(page, WIDE);

  const stopped = (await exportPng(page)).bytes;

  await expect(page.locator(transport)).toBeEnabled();
  await page.locator(transport).click();
  // The staff is visibly shading a measure — and the export is unchanged, byte
  // for byte, because the shading was never part of the drawing.
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

    // The confirmation only appears once the clipboard write has resolved, so
    // it is the whole round trip that is being asserted here.
    await expect(page.locator(copy)).toHaveText('Copied');
    expect(errors).toEqual([]);
  });

  test('is absent, not merely disabled, when the browser cannot', async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'ClipboardItem');
    });
    await load(page, WIDE);

    // The download is still there, so this is the copy control going away and
    // not the whole component failing to render.
    await expect(page.locator(copy)).toHaveCount(0);
    await expect(page.locator(download)).toHaveCount(1);
  });
});
