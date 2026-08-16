import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { defaultPattern } from '../../src/core/pattern.js';
import { audioLog, instrumentAudio } from './support/audio-log.js';

/** Long enough that a hold has fired, short enough to stay a quick test. */
const HELD_MS = 700;

/** First cell the default groove leaves empty in a lane. */
function silentCell(page: Page, instrument: 'hihat' | 'snare' | 'kick'): Locator {
  const step = defaultPattern().lanes[instrument].indexOf('empty');
  return page.locator(`button[data-instrument="${instrument}"][data-step="${step}"]`);
}

/** First cell the default groove writes in a lane. */
function writtenCell(page: Page, instrument: 'hihat' | 'snare' | 'kick'): Locator {
  const step = defaultPattern().lanes[instrument].indexOf('normal');
  return page.locator(`button[data-instrument="${instrument}"][data-step="${step}"]`);
}

async function centre(cell: Locator): Promise<{ x: number; y: number }> {
  const box = await cell.boundingBox();
  if (box === null) throw new Error('cell has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A press held on a cell, released where it started. */
async function press(page: Page, cell: Locator, ms: number): Promise<void> {
  const { x, y } = await centre(cell);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await instrumentAudio(page);
  await page.goto('/');
  // Every cell here is pressed for its sound as much as its state.
  await expect(silentCell(page, 'snare')).toBeEnabled();
});

test('opens the menu on a hold and leaves an early release a plain tap', async ({ page }) => {
  const cell = silentCell(page, 'snare');
  const menu = page.getByRole('menu');

  await press(page, cell, 120);
  await expect(menu).toBeHidden();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  await press(page, cell, HELD_MS);
  await expect(menu).toBeVisible();
  // The hold wrote nothing on its way to the menu.
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
});

test('opens the same menu on a right-click and on the keyboard menu key', async ({ page }) => {
  const cell = silentCell(page, 'hihat');
  const menu = page.getByRole('menu');
  const entries = () => menu.getByRole('menuitemradio').allTextContents();

  await cell.click({ button: 'right' });
  await expect(menu).toBeVisible();
  const byPointer = await entries();

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await cell.focus();
  await page.keyboard.press('ContextMenu');
  await expect(menu).toBeVisible();
  expect(await entries()).toEqual(byPointer);

  await page.keyboard.press('Escape');
  await cell.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  expect(await entries()).toEqual(byPointer);
});

test('marks the articulation the cell holds, empty or written', async ({ page }) => {
  const checked = page.getByRole('menuitemradio', { checked: true });

  await silentCell(page, 'kick').click({ button: 'right' });
  await expect(checked).toHaveAttribute('data-articulation', 'empty');

  await page.keyboard.press('Escape');
  await writtenCell(page, 'kick').click({ button: 'right' });
  await expect(checked).toHaveAttribute('data-articulation', 'normal');
});

test('closes on Escape and on a press outside, changing nothing and handing focus back', async ({
  page,
}) => {
  const cell = writtenCell(page, 'snare');
  const menu = page.getByRole('menu');

  await press(page, cell, HELD_MS);
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(menu).toBeHidden();
  await expect(cell).toBeFocused();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  await press(page, cell, HELD_MS);
  await expect(menu).toBeVisible();
  await page.locator('h1').click();

  await expect(menu).toBeHidden();
  await expect(cell).toBeFocused();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  expect((await audioLog(page)).starts).toEqual([]);
});

test('writes and sounds a plain hit from the menu, and rubs one out in silence', async ({
  page,
}) => {
  const cell = silentCell(page, 'snare');
  const menu = page.getByRole('menu');

  await press(page, cell, HELD_MS);
  await menu.getByRole('menuitemradio', { name: 'Plain' }).click();

  await expect(menu).toBeHidden();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(cell).toBeFocused();
  // No time handed over: an audition sounds at once, not through a queue.
  expect((await audioLog(page)).starts).toEqual([undefined]);

  await press(page, cell, HELD_MS);
  await menu.getByRole('menuitemradio', { name: 'Empty' }).click();

  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await expect(cell).toBeFocused();
  expect((await audioLog(page)).starts).toEqual([undefined]);
});

test('writes and sounds an accent from the menu, at the hardest rung', async ({ page }) => {
  const cell = silentCell(page, 'snare');
  const menu = page.getByRole('menu');

  await press(page, cell, HELD_MS);
  await menu.getByRole('menuitemradio', { name: 'Accent' }).click();

  await expect(menu).toBeHidden();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(cell).toBeFocused();

  const log = await audioLog(page);
  expect(log.starts).toEqual([undefined]);
  expect(log.samples).toEqual(['Snare-Hardest']);
});

test('writes and sounds a ghost note from the menu, at the softest rung', async ({ page }) => {
  const cell = silentCell(page, 'snare');
  const menu = page.getByRole('menu');

  await press(page, cell, HELD_MS);
  await menu.getByRole('menuitemradio', { name: 'Ghost' }).click();

  await expect(menu).toBeHidden();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(cell).toHaveAttribute('aria-label', /Snare, step \d+, Ghost$/);

  const log = await audioLog(page);
  expect(log.starts).toEqual([undefined]);
  expect(log.samples).toEqual(['Snare-Softest']);
});

test('marks the entry a cell already holds, on an accent as on an empty cell', async ({ page }) => {
  const cell = silentCell(page, 'hihat');
  const menu = page.getByRole('menu');

  await press(page, cell, HELD_MS);
  await expect(menu.getByRole('menuitemradio', { name: 'Empty' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await menu.getByRole('menuitemradio', { name: 'Accent' }).click();

  await press(page, cell, HELD_MS);
  await expect(menu.getByRole('menuitemradio', { name: 'Accent' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('names the articulation a cell holds, so a reader hears more than written', async ({
  page,
}) => {
  const cell = silentCell(page, 'snare');
  const menu = page.getByRole('menu');

  await expect(cell).toHaveAttribute('aria-label', /Snare, step \d+, Empty$/);

  await press(page, cell, HELD_MS);
  await menu.getByRole('menuitemradio', { name: 'Accent' }).click();
  await expect(cell).toHaveAttribute('aria-label', /Snare, step \d+, Accent$/);

  await cell.click();
  await expect(cell).toHaveAttribute('aria-label', /Snare, step \d+, Empty$/);
});

test('abandons a hold that drifts past a small threshold', async ({ page }) => {
  const cell = silentCell(page, 'hihat');
  const { x, y } = await centre(cell);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 12, { steps: 4 });
  await page.waitForTimeout(HELD_MS);
  await page.mouse.up();

  await expect(page.getByRole('menu')).toBeHidden();
});

test('advertises the menu without losing written from empty', async ({ page }) => {
  const written = writtenCell(page, 'hihat');
  const empty = silentCell(page, 'hihat');

  await expect(written).toHaveAttribute('aria-haspopup', 'menu');
  await expect(written).toHaveAttribute('aria-pressed', 'true');
  await expect(empty).toHaveAttribute('aria-haspopup', 'menu');
  await expect(empty).toHaveAttribute('aria-pressed', 'false');
  await expect(written).toHaveAttribute('aria-expanded', 'false');

  await press(page, written, HELD_MS);

  // Only the cell that opened it says so, and the menu says whose it is.
  await expect(written).toHaveAttribute('aria-expanded', 'true');
  await expect(empty).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('menu')).toHaveAttribute('aria-label', /Hi-hat, step \d+/);
});

/* Whether iOS honours these is deliberately untested: the callout is an iOS
   Safari behaviour, and neither Chromium nor headless WebKit on Linux
   reproduces it. What is asserted is that all three are declared on the cell
   together, so none can be dropped without this failing. */
test('suppresses the platform callout with all three properties on the cell', async ({ page }) => {
  const rule = await page.evaluate(() => {
    const cell = document.querySelector('button.cell');
    const scope = [...(cell?.classList ?? [])].find((name) => name.startsWith('svelte-'));
    return [...document.querySelectorAll('style')]
      .map((tag) => tag.textContent ?? '')
      .join('')
      .split('}')
      .find((block) => block.includes(`.cell.${scope}`) && block.includes('touch-action'));
  });

  expect(rule).toBeDefined();
  for (const property of ['touch-action:', '-webkit-touch-callout:', 'user-select:']) {
    expect(rule).toContain(property);
  }
});

test.describe('with a finger', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 480 } });

  test('never opens the menu when the press becomes a scroll', async ({ page }) => {
    const cell = silentCell(page, 'hihat');
    const { x, y } = await centre(cell);
    // Real touches, so the browser takes the gesture for the scroll itself —
    // which is what a finger starting on a cell has to be allowed to do.
    const input = await page.context().newCDPSession(page);
    const finger = async (type: 'touchStart' | 'touchMove' | 'touchEnd', dy?: number) =>
      await input.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: dy === undefined ? [] : [{ x, y: y + dy }],
      });

    await finger('touchStart', 0);
    for (const dy of [-20, -70, -130, -190]) {
      await finger('touchMove', dy);
      await page.waitForTimeout(80);
    }
    // Held past the hold: a scroll under way outlasting it opens nothing.
    await page.waitForTimeout(HELD_MS);
    await finger('touchEnd');

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(cell).toHaveAttribute('aria-pressed', 'false');
  });
});
