import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/* One question, one look. The four controls that ask are in three components
   and take their asking appearance from one rule keyed on the state they all
   report, so the check is that none of them has drifted from the others.
   Worth asserting in a browser: a rule that loses on specificity leaves the
   control looking idle while it asks, and nothing else here would notice. */

const clear = '.clear';
const toggle = '[data-patterns="toggle"]';
const field = '[data-patterns="name"]';
const save = '[data-patterns="save"]';
const loader = '[data-patterns="load"]';
const remove = '[data-patterns="delete"]';

/** What a control is wearing, as the browser has worked it out. */
function look(page: Page, selector: string) {
  return page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      border: style.borderTopColor,
      tint: style.backgroundColor,
      ink: style.color,
      weight: style.fontWeight,
    };
  });
}

/** The red border, tint, colour and weight a standing question wears. */
const ASKING = {
  border: 'rgb(185, 28, 28)',
  tint: 'rgb(254, 226, 226)',
  ink: 'rgb(153, 27, 27)',
  weight: '600',
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Clear wears the asking look while its question stands', async ({ page }) => {
  await page.locator(clear).click();

  await expect(page.locator(clear)).toHaveAttribute('data-state', 'asking');
  expect(await look(page, clear)).toEqual(ASKING);
});

test('Save and Delete wear the same look, to the shade', async ({ page }) => {
  await page.locator(toggle).click();
  await page.locator(field).fill('Bossa');
  await page.locator(save).click();

  // Asking over the name just kept.
  await page.locator(field).fill('Bossa');
  await page.locator(save).click();
  await expect(page.locator(save)).toHaveAttribute('data-state', 'asking');
  expect(await look(page, save)).toEqual(ASKING);

  await page.locator(remove).click();
  await expect(page.locator(remove)).toHaveAttribute('data-state', 'asking');
  expect(await look(page, remove)).toEqual(ASKING);
});

/* The Row is different on purpose: a whole line reddened and emboldened would
   pull its own text about, so it takes the tint and leaves the rest. */
test('the Row takes the tint alone, and keeps its shape', async ({ page }) => {
  await page.locator(toggle).click();
  await page.locator(field).fill('Bossa');
  await page.locator(save).click();

  const idle = await look(page, loader);

  // Something unkept on the grid, so loading has a question to ask.
  await page.locator('button[data-instrument="snare"][data-step="0"]').click();
  await page.locator(loader).click();
  await expect(page.locator(loader)).toHaveAttribute('data-state', 'asking');

  const asking = await look(page, loader);
  expect(asking.tint).toBe(ASKING.tint);
  expect(asking.ink).toBe(idle.ink);
  expect(asking.weight).toBe(idle.weight);

  // The word standing in the tempo's slot is where the Row says it in ink, and
  // it is the question's ink, not one of its own.
  const word = await look(page, `${loader} .question`);
  expect(word.ink).toBe(ASKING.ink);
  expect(word.weight).toBe(ASKING.weight);
});
