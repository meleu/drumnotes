import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import type { Articulation, InstrumentId, Pattern } from '../../src/core/pattern.js';
import { INSTRUMENTS, defaultPattern } from '../../src/core/pattern.js';

// Each test gets its own context, so storage starts empty unless seeded.

/** Steps the grid shows filled, in document order. */
function filledCells(page: Page, instrument: InstrumentId) {
  return page
    .locator(`button[data-instrument="${instrument}"][aria-pressed="true"]`)
    .evaluateAll((cells) => cells.map((cell) => Number((cell as HTMLElement).dataset.step)));
}

function filledSteps(lane: readonly Articulation[]): number[] {
  return lane.flatMap((articulation, step) => (articulation === 'empty' ? [] : [step]));
}

async function expectGridToShow(page: Page, pattern: Pattern) {
  for (const { id } of INSTRUMENTS) {
    await expect
      .poll(() => filledCells(page, id), { message: `${id} lane` })
      .toEqual(filledSteps(pattern.lanes[id]));
  }
}

test('a first-time visitor lands on the default rock beat', async ({ page }) => {
  await page.goto('/');

  await expectGridToShow(page, defaultPattern());
});

test('an edit survives a reload', async ({ page }) => {
  await page.goto('/');
  const silent = defaultPattern().lanes.kick.indexOf('empty');
  const cell = page.locator(`button[data-instrument="kick"][data-step="${silent}"]`);

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  await page.reload();

  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('button[data-instrument="kick"][aria-pressed="true"]')).toHaveCount(
    filledSteps(defaultPattern().lanes.kick).length + 1,
  );
});

test('a groove stored before articulations existed loads unchanged', async ({ page }) => {
  await page.goto('/');
  // Exactly what v1.0.0 wrote: same groove, cells as booleans.
  const version1 = JSON.stringify({
    version: 1,
    tempo: defaultPattern().tempo,
    lanes: Object.fromEntries(
      INSTRUMENTS.map(({ id }) => [
        id,
        defaultPattern().lanes[id].map((articulation) => articulation !== 'empty'),
      ]),
    ),
  });
  await page.evaluate(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [STORAGE_KEY, version1],
  );

  await page.reload();

  await expectGridToShow(page, defaultPattern());
});

test('corrupt stored data falls back to the default pattern', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((key) => localStorage.setItem(key, '{"version":'), STORAGE_KEY);

  await page.reload();

  await expectGridToShow(page, defaultPattern());
});
