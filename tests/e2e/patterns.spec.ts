import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { STORAGE_KEY } from '../../src/adapters/storage.js';
import { MAX_NAME_LENGTH, emptyLibrary, keep as kept } from '../../src/core/library.js';
import { DEFAULT_TEMPO, defaultPattern } from '../../src/core/pattern.js';
import { storedApp, withUnreadable } from './support/store.js';

// Each test gets its own context, so the library starts empty unless seeded.

const toggle = '[data-patterns="toggle"]';
const panel = '#patterns-panel';
const field = '[data-patterns="name"]';
const save = '[data-patterns="save"]';
const clear = '.clear';
const rows = `${panel} .row`;
const noteheads = '.sheet svg .vf-notehead';
const transport = '.transport';
const lit = '.cell.playing';
const tempoField = 'input[aria-label="Tempo in beats per minute"]';

/** Cells the grid shows as written, across every instrument. */
function written(page: Page) {
  return page.locator('button[data-instrument][aria-pressed="true"]');
}

function row(page: Page, name: string) {
  return page.locator(`${panel} [data-pattern="${name}"]`);
}

/** What it takes to keep the groove on the grid under a name. */
async function keep(page: Page, name: string): Promise<void> {
  await page.locator(field).fill(name);
  await page.locator(save).click();
}

/** Puts a row back on the grid; asks first when unkept work would be lost. */
function loader(page: Page, name: string) {
  return row(page, name).locator('[data-patterns="load"]');
}

/** Loads a kept pattern when nothing is at stake: grid empty, or itself kept. */
async function load(page: Page, name: string): Promise<void> {
  await loader(page, name).click();
}

/** The same over work kept nowhere: first press asks, second answers. */
async function loadOver(page: Page, name: string): Promise<void> {
  await load(page, name);
  await load(page, name);
}

/** The names the panel is showing, in the order it is showing them. */
function listed(page: Page) {
  return page.locator(`${rows} .name`);
}

/** The control that drops a row, which asks before it acts. */
function remove(page: Page, name: string) {
  return row(page, name).locator('[data-patterns="delete"]');
}

/** Puts a store in front of the app and opens the app again on it. */
async function seed(page: Page, stored: string): Promise<void> {
  await page.evaluate(([key, store]) => localStorage.setItem(key!, store!), [STORAGE_KEY, stored]);
  await page.reload();
}

/** One readable entry beside two unreadable: rot where a pattern should be, and
 *  a pattern kept by a later version. */
function withRottedEntries(): string {
  const library = kept(emptyLibrary(), 'Bossa', defaultPattern());
  return withUnreadable(storedApp(defaultPattern(), library), {
    Rotted: '{"version":',
    Newer: { version: 99, tempo: DEFAULT_TEMPO, lanes: defaultPattern().lanes },
  });
}

/** Names the store itself holds — where a dropped entry would reappear if it
 *  had not really gone. */
async function storedNames(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      library?: Record<string, unknown>;
    };
    return Object.keys(stored.library ?? {}).sort();
  }, STORAGE_KEY);
}

/** Puts focus above every control, so a tab walk starts where a drummer
 *  arriving by keyboard would. */
async function startOver(page: Page): Promise<void> {
  await page.locator('h1').click();
  await expect(page.locator('h1')).toBeVisible();
}

/** Tabs forward until the control has focus, exercising the way to it rather
 *  than assuming it. Throws rather than hanging if never reached. */
async function tabTo(page: Page, selector: string): Promise<void> {
  const focused = () => page.locator(selector).evaluate((node) => node === document.activeElement);
  for (let presses = 0; presses < 40; presses += 1) {
    if (await focused()) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`${selector} was never reached by tabbing`);
}

async function retune(page: Page, bpm: string): Promise<void> {
  await page.locator(tempoField).fill(bpm);
  await page.locator(tempoField).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the panel is closed when the app opens', async ({ page }) => {
  await expect(page.locator(toggle)).toBeVisible();
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(panel)).toHaveCount(0);
});

test('the control opens the panel and closes it again', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.locator(panel)).toBeVisible();
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'true');

  await page.locator(toggle).click();

  await expect(page.locator(panel)).toHaveCount(0);
});

test('the panel holds a labelled field, a Save button and the rows, in order', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.getByLabel('Name')).toHaveCount(1);
  await expect(page.locator(`${panel} :is(input, ${save}, .row)`)).toHaveText([
    '', // the name field carries no text of its own
    'Save',
  ]);

  await keep(page, 'Bossa');

  await expect(page.locator(`${panel} :is(input, ${save}, .row)`)).toHaveText([
    '',
    'Save',
    /Bossa/,
  ]);
});

test('an empty library says so in place of the rows', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.locator('[data-patterns="empty"]')).toBeVisible();
  await expect(page.locator(rows)).toHaveCount(0);

  await keep(page, 'Bossa');

  await expect(page.locator('[data-patterns="empty"]')).toHaveCount(0);
});

test('keeping a groove under a name lists it with its tempo', async ({ page }) => {
  await page.locator(toggle).click();

  await keep(page, 'Bossa');

  await expect(row(page, 'Bossa')).toContainText('Bossa');
  await expect(row(page, 'Bossa')).toContainText(`${DEFAULT_TEMPO} BPM`);
});

test('the panel stays open after a save, with the new row in it', async ({ page }) => {
  await page.locator(toggle).click();

  await keep(page, 'Bossa');

  await expect(page.locator(panel)).toBeVisible();
  await expect(row(page, 'Bossa')).toBeVisible();
});

test('saving leaves the groove on the grid alone', async ({ page }) => {
  const before = await written(page).count();
  expect(before).toBeGreaterThan(0);
  await page.locator(toggle).click();

  await keep(page, 'Bossa');

  await expect(written(page)).toHaveCount(before);
  await expect(page.locator(tempoField)).toHaveValue(String(DEFAULT_TEMPO));
});

/* Saving copies out, changing nothing that is playing: the loop runs on,
   unlike a load or a clear. */
test('saving leaves playback running', async ({ page }) => {
  await page.locator(toggle).click();
  await expect(page.locator(transport)).toBeEnabled();
  await page.locator(transport).click();
  await expect(page.locator(lit)).not.toHaveCount(0);

  await keep(page, 'Bossa');

  await expect(page.locator(transport)).toHaveAttribute('data-state', 'playing');
  await expect(page.locator(lit)).not.toHaveCount(0);
});

test('the library is still there after a reload', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await page.reload();
  await page.locator(toggle).click();

  await expect(row(page, 'Bossa')).toContainText(`${DEFAULT_TEMPO} BPM`);
});

test('tapping a row puts that groove back on the grid and staff', async ({ page }) => {
  await page.waitForSelector(noteheads);
  const drawn = await page.locator(noteheads).count();
  const hits = await written(page).count();
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await loadOver(page, 'Bossa');

  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await expect(written(page)).toHaveCount(hits);
  await expect(page.locator(noteheads)).toHaveCount(drawn);
});

test('the tempo a pattern was kept at comes back with it', async ({ page }) => {
  await retune(page, '140');
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await retune(page, '80');

  await loadOver(page, 'Bossa');

  await expect(page.locator(tempoField)).toHaveValue('140');
});

test('the panel closes after a load, returning the drummer to the grid', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await load(page, 'Bossa');

  await expect(page.locator(panel)).toHaveCount(0);
  await expect(page.locator(toggle)).toHaveAttribute('aria-expanded', 'false');
});

/* A load is a different piece of music, not an edit to the one playing: the
   loop stops rather than lurching into the new groove mid-pass. */
test('loading stops the transport and clears the playhead', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await expect(page.locator(transport)).toBeEnabled();
  await page.locator(transport).click();
  await expect(page.locator(lit)).not.toHaveCount(0);

  await load(page, 'Bossa');

  await expect(page.locator(transport)).toHaveAttribute('data-state', 'stopped');
  await expect(page.locator(lit)).toHaveCount(0);
});

test('editing after a load leaves the kept entry as it was', async ({ page }) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await load(page, 'Bossa');

  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await page.locator(toggle).click();
  await loadOver(page, 'Bossa');

  // What comes back is what was kept, not what the grid has been doing since.
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
});

test('the loaded pattern is the one on the grid after a reload', async ({ page }) => {
  const silent = defaultPattern().lanes.kick.indexOf('empty');
  const cell = page.locator(`button[data-instrument="kick"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await retune(page, '140');
  await keep(page, 'Bossa');
  await cell.click();
  await retune(page, '80');

  await loadOver(page, 'Bossa');
  await page.reload();

  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(tempoField)).toHaveValue('140');
});

test('a cell tap and a save both land: neither write loses the other', async ({ page }) => {
  const silent = defaultPattern().lanes.kick.indexOf('empty');
  const cell = page.locator(`button[data-instrument="kick"][data-step="${silent}"]`);
  await page.locator(toggle).click();

  await cell.click();
  await keep(page, 'Bossa');

  await page.reload();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await page.locator(toggle).click();
  await expect(row(page, 'Bossa')).toBeVisible();
});

/* A dropped groove cannot be got back, and rows are as wide as a thumb:
   deleting costs two presses, like clearing. */
test('one press asks rather than deleting the row', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await remove(page, 'Bossa').click();

  await expect(remove(page, 'Bossa')).toHaveAttribute('data-state', 'asking');
  await expect(remove(page, 'Bossa')).toHaveAccessibleName(/press again/i);
  await expect(row(page, 'Bossa')).toBeVisible();
});

test('a second press drops the row, and it stays gone across a reload', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await keep(page, 'Funk');

  await remove(page, 'Bossa').click();
  await remove(page, 'Bossa').click();

  await expect(row(page, 'Bossa')).toHaveCount(0);
  await expect(row(page, 'Funk')).toBeVisible();

  await page.reload();
  await page.locator(toggle).click();

  await expect(row(page, 'Bossa')).toHaveCount(0);
  await expect(row(page, 'Funk')).toBeVisible();
});

/* What was saved is a copy, so dropping it reaches nothing on the grid — even
   when the grid is playing the very groove being deleted. */
test('deleting leaves the groove on the grid and its tempo alone', async ({ page }) => {
  await retune(page, '140');
  const hits = await written(page).count();
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await load(page, 'Bossa');
  await page.locator(toggle).click();

  await remove(page, 'Bossa').click();
  await remove(page, 'Bossa').click();

  await expect(row(page, 'Bossa')).toHaveCount(0);
  await expect(written(page)).toHaveCount(hits);
  await expect(page.locator(tempoField)).toHaveValue('140');
});

/* Withdrawal after the wait is the Question module's rule, covered on a fake
   clock in `src/state/question.test.ts`. What only a browser can show is that
   real focus leaving really does take the question back. */
test('takes the question back when attention moves elsewhere', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await remove(page, 'Bossa').click();
  await expect(remove(page, 'Bossa')).toHaveAttribute('data-state', 'asking');

  await page.locator(field).click();

  await expect(remove(page, 'Bossa')).toHaveAttribute('data-state', 'idle');
  await expect(row(page, 'Bossa')).toBeVisible();

  // The next press asks again rather than deleting on the spot.
  await remove(page, 'Bossa').click();
  await expect(row(page, 'Bossa')).toBeVisible();
});

test('asking about one row does not arm another', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await keep(page, 'Funk');

  await remove(page, 'Bossa').click();

  await expect(remove(page, 'Funk')).toHaveAttribute('data-state', 'idle');

  // And a press on the other row asks about it rather than answering the first.
  await remove(page, 'Funk').click();

  await expect(remove(page, 'Funk')).toHaveAttribute('data-state', 'asking');
  await expect(remove(page, 'Bossa')).toHaveAttribute('data-state', 'idle');
  await expect(row(page, 'Funk')).toBeVisible();
});

/* Keeping costs one press when no name was thought of: the field arrives
   carrying a free name, so that path never hits a question. */
test('the field arrives carrying the first unused name in the series', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.locator(field)).toHaveValue('Pattern 1');
});

test('the suggestion is selected, so typing a real name replaces it', async ({ page }) => {
  await page.locator(toggle).click();

  await page.keyboard.type('Bossa');

  await expect(page.locator(field)).toHaveValue('Bossa');
});

/* The point of the suggestion: press Patterns, press Save, groove kept.
   Reopening moves the series on rather than offering a taken name. */
test('keeping the suggested name and reopening offers the next one', async ({ page }) => {
  await page.locator(toggle).click();
  await page.locator(save).click();

  await expect(row(page, 'Pattern 1')).toBeVisible();

  await page.locator(toggle).click();
  await page.locator(toggle).click();

  await expect(page.locator(field)).toHaveValue('Pattern 2');
});

test('the field takes a name only so long', async ({ page }) => {
  await page.locator(toggle).click();

  await page.locator(field).fill('');
  await page.locator(field).pressSequentially('x'.repeat(MAX_NAME_LENGTH + 5));

  await expect(page.locator(field)).toHaveValue('x'.repeat(MAX_NAME_LENGTH));
});

test('a name is trimmed before it is kept', async ({ page }) => {
  await page.locator(toggle).click();

  await keep(page, '  Bossa  ');

  await expect(row(page, 'Bossa')).toBeVisible();
  await expect(listed(page)).toHaveText(['Bossa']);
});

/* Save is dead where it could only harm: nothing kept under no name, and no
   library full of empty grooves. */
test('Save is dead while the field holds nothing but whitespace', async ({ page }) => {
  await page.locator(toggle).click();
  await expect(page.locator(save)).toBeEnabled();

  await page.locator(field).fill('');

  await expect(page.locator(save)).toBeDisabled();

  await page.locator(field).fill('   ');

  await expect(page.locator(save)).toBeDisabled();

  await page.locator(field).fill('Bossa');

  await expect(page.locator(save)).toBeEnabled();
});

test('Save is dead while the grid is silent, and comes back with a hit', async ({ page }) => {
  const cell = page.locator('button[data-instrument="snare"][data-step="0"]');
  await page.locator(clear).click();
  await page.locator(clear).click();
  await page.locator(toggle).click();

  await expect(page.locator(save)).toBeDisabled();

  await cell.click();

  await expect(page.locator(save)).toBeEnabled();
});

/* A kept name holds a groove meant to be kept, so overwriting costs the same
   two presses clearing and deleting do. */
test('saving over a kept name asks rather than writing over it', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await page.locator(field).fill('Bossa');
  await page.locator(save).click();

  await expect(page.locator(save)).toHaveAttribute('data-state', 'asking');
  await expect(page.locator(save)).toHaveAccessibleName(/press again/i);
  await expect(listed(page)).toHaveText(['Bossa']);
});

test('a free name still keeps in one press, with nothing to answer', async ({ page }) => {
  await page.locator(toggle).click();

  await page.locator(field).fill('Bossa');

  await expect(page.locator(save)).toHaveAttribute('data-state', 'idle');

  await page.locator(save).click();

  await expect(listed(page)).toHaveText(['Bossa']);
});

/* One identity whatever the case, so a second spelling asks about the row it
   would overwrite rather than quietly making another. */
test('a name differing only in case counts as kept, and asks too', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await page.locator(field).fill('bossa');
  await page.locator(save).click();

  await expect(page.locator(save)).toHaveAttribute('data-state', 'asking');
  await expect(listed(page)).toHaveText(['Bossa']);
});

/* Answering replaces the entry whole: one row, reading the name as it was just
   typed, at the tempo it was just saved at. */
test('a second press replaces the entry, name and tempo alike', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await retune(page, '140');

  await page.locator(field).fill('bossa');
  await page.locator(save).click();
  await page.locator(save).click();

  await expect(listed(page)).toHaveText(['bossa']);
  await expect(page.locator(rows)).toHaveCount(1);
  await expect(page.locator(rows)).toContainText('140 BPM');
});

test('takes the replace question back when it goes unanswered', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await retune(page, '140');

  await page.locator(field).fill('Bossa');
  await page.locator(save).click();
  await expect(page.locator(save)).toHaveAttribute('data-state', 'asking');

  // Waits the question out rather than answering it.
  await expect(page.locator(save)).toHaveAttribute('data-state', 'idle', { timeout: 15000 });
  await expect(row(page, 'Bossa')).toContainText(`${DEFAULT_TEMPO} BPM`);
});

test('takes the replace question back when attention moves elsewhere', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await retune(page, '140');

  await page.locator(field).fill('Bossa');
  await page.locator(save).click();
  await expect(page.locator(save)).toHaveAttribute('data-state', 'asking');

  await page.locator(field).click();

  await expect(page.locator(save)).toHaveAttribute('data-state', 'idle');
  await expect(row(page, 'Bossa')).toContainText(`${DEFAULT_TEMPO} BPM`);
});

/* The question is about a name, not the button, so it cannot be answered
   against a different name. */
test('naming something free while the question stands puts Save back', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await page.locator(field).fill('Bossa');
  await page.locator(save).click();
  await expect(page.locator(save)).toHaveAttribute('data-state', 'asking');

  await page.locator(field).fill('Funk');

  await expect(page.locator(save)).toHaveAttribute('data-state', 'idle');
  await expect(page.locator(save)).toHaveAccessibleName('Save');

  await page.locator(save).click();

  await expect(listed(page)).toHaveText(['Bossa', 'Funk']);
});

/* A pattern is always in the same place, found by reading rather than hunting
   through save order. */
test('lists the rows in the order a drummer would count them', async ({ page }) => {
  await page.locator(toggle).click();

  await keep(page, 'Pattern 10');
  await keep(page, 'bossa');
  await keep(page, 'Pattern 2');
  await keep(page, 'Bebop');

  await expect(listed(page)).toHaveText(['Bebop', 'bossa', 'Pattern 2', 'Pattern 10']);
});

test('a new row arrives in its place in the list, not at the end', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await keep(page, 'Samba');

  await keep(page, 'Funk');

  await expect(listed(page)).toHaveText(['Bossa', 'Funk', 'Samba']);
});

/* The row holding the grid says so, so a drummer can tell where they are.
   Nothing remembered: the pattern is compared against the kept ones each ask. */
test('saving marks the row that was just saved', async ({ page }) => {
  await page.locator(toggle).click();

  await keep(page, 'Bossa');

  await expect(row(page, 'Bossa')).toHaveAttribute('data-on-grid', 'true');
  await expect(row(page, 'Bossa').locator('[data-patterns="load"]')).toHaveAccessibleName(
    /on the grid/i,
  );
});

test('loading marks the row that was just loaded', async ({ page }) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await cell.click();
  await keep(page, 'Funk');

  await load(page, 'Bossa');
  await page.locator(toggle).click();

  await expect(row(page, 'Bossa')).toHaveAttribute('data-on-grid', 'true');
  await expect(row(page, 'Funk')).toHaveAttribute('data-on-grid', 'false');
});

/* The mark is a comparison, not a memory, so one cell takes it off at once —
   that divergence is what the drummer is being shown. */
test('changing a cell takes the mark off, and putting it back brings it again', async ({
  page,
}) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await cell.click();

  await expect(row(page, 'Bossa')).toHaveAttribute('data-on-grid', 'false');
  await expect(row(page, 'Bossa').locator('[data-patterns="load"]')).not.toHaveAccessibleName(
    /on the grid/i,
  );

  await cell.click();

  await expect(row(page, 'Bossa')).toHaveAttribute('data-on-grid', 'true');
});

/* The tempo is part of the pattern, so retuning is unkept work like any other. */
test('changing the tempo alone takes the mark off', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await retune(page, '140');

  await expect(row(page, 'Bossa')).toHaveAttribute('data-on-grid', 'false');

  await retune(page, String(DEFAULT_TEMPO));

  await expect(row(page, 'Bossa')).toHaveAttribute('data-on-grid', 'true');
});

test('never marks more than one row, even when a groove is kept twice', async ({ page }) => {
  await page.locator(toggle).click();

  await keep(page, 'Samba');
  await keep(page, 'Bossa');

  await expect(page.locator(`${rows}[data-on-grid="true"]`)).toHaveCount(1);
});

/* Loading throws the grid away, so it asks when that is worth something: hits
   kept nowhere. Decided by the comparison that marks a row, so both agree. */
test('tapping a row asks before loading over work kept nowhere', async ({ page }) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await cell.click();

  await load(page, 'Bossa');

  await expect(loader(page, 'Bossa')).toHaveAttribute('data-state', 'asking');
  await expect(loader(page, 'Bossa')).toHaveAccessibleName(/press again/i);
  await expect(page.locator(panel)).toBeVisible();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  await load(page, 'Bossa');

  await expect(page.locator(panel)).toHaveCount(0);
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
});

test('tapping a row loads outright when the grid is itself something kept', async ({ page }) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await cell.click();
  await keep(page, 'Funk');

  await load(page, 'Bossa');

  await expect(page.locator(panel)).toHaveCount(0);
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
});

test('tapping a row loads outright when the grid is empty', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await page.locator(clear).click();
  await page.locator(clear).click();
  await expect(written(page)).toHaveCount(0);

  await load(page, 'Bossa');

  await expect(page.locator(panel)).toHaveCount(0);
  await expect(written(page)).not.toHaveCount(0);
});

test('takes the load question back when it goes unanswered', async ({ page }) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await cell.click();

  await load(page, 'Bossa');
  await expect(loader(page, 'Bossa')).toHaveAttribute('data-state', 'asking');

  // Waits the question out rather than answering it.
  await expect(loader(page, 'Bossa')).toHaveAttribute('data-state', 'idle', { timeout: 15000 });
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
});

test('takes the load question back when attention moves elsewhere', async ({ page }) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await cell.click();

  await load(page, 'Bossa');
  await expect(loader(page, 'Bossa')).toHaveAttribute('data-state', 'asking');

  await page.locator(field).click();

  await expect(loader(page, 'Bossa')).toHaveAttribute('data-state', 'idle');
  await expect(cell).toHaveAttribute('aria-pressed', 'true');

  // The next press asks again rather than loading on the spot.
  await load(page, 'Bossa');
  await expect(page.locator(panel)).toBeVisible();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
});

test('the order is the same after a reload', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Pattern 10');
  await keep(page, 'Pattern 2');
  await keep(page, 'apple');

  await page.reload();
  await page.locator(toggle).click();

  await expect(listed(page)).toHaveText(['apple', 'Pattern 2', 'Pattern 10']);
});

test('entries the app cannot read are left out, and the rest of the library shows', async ({
  page,
}) => {
  await seed(page, withRottedEntries());

  await page.locator(toggle).click();

  await expect(listed(page)).toHaveText(['Bossa']);
});

test('the next write persists the pruned map', async ({ page }) => {
  await seed(page, withRottedEntries());
  await page.locator(toggle).click();

  await keep(page, 'Funk');

  expect(await storedNames(page)).toEqual(['Bossa', 'Funk']);

  await page.reload();
  await page.locator(toggle).click();

  await expect(listed(page)).toHaveText(['Bossa', 'Funk']);
});

test('a wholly unreadable store opens on the default groove with nothing kept', async ({
  page,
}) => {
  await seed(page, '{"version":');

  await expect(written(page)).toHaveCount(
    Object.values(defaultPattern().lanes)
      .flat()
      .filter((articulation) => articulation !== 'empty').length,
  );

  await page.locator(toggle).click();

  await expect(page.locator(`${panel} [data-patterns="empty"]`)).toBeVisible();
  await expect(page.locator(rows)).toHaveCount(0);
});

/* No more a pointer's feature than the grid: every act works from the keyboard
   alone, both presses of every question included. */
test('keeps a groove without a pointer', async ({ page }) => {
  await tabTo(page, toggle);
  await page.keyboard.press('Enter');

  // Opening puts the drummer where the typing goes, with the suggestion selected.
  await expect(page.locator(field)).toBeFocused();

  await page.keyboard.type('Bossa');
  await page.keyboard.press('Tab');

  await expect(page.locator(save)).toBeFocused();

  await page.keyboard.press('Enter');

  await expect(row(page, 'Bossa')).toBeVisible();
});

test('puts a groove back on the grid without a pointer, question and all', async ({ page }) => {
  const silent = defaultPattern().lanes.snare.indexOf('empty');
  const cell = page.locator(`button[data-instrument="snare"][data-step="${silent}"]`);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  // Unkept work on the grid, so loading over it asks first.
  await cell.click();
  await startOver(page);

  await tabTo(page, `${panel} [data-patterns="load"]`);
  await page.keyboard.press('Enter');

  await expect(loader(page, 'Bossa')).toHaveAttribute('data-state', 'asking');

  await page.keyboard.press('Enter');

  await expect(page.locator(panel)).toHaveCount(0);
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
});

test('drops a row without a pointer, question and all', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await tabTo(page, `${panel} [data-patterns="delete"]`);
  await page.keyboard.press('Enter');

  await expect(remove(page, 'Bossa')).toHaveAttribute('data-state', 'asking');

  await page.keyboard.press('Enter');

  await expect(row(page, 'Bossa')).toHaveCount(0);
});

/* A control vanishing under the finger takes the keyboard's place with it, and
   focus lands at the top of the document. Both acts that remove what was just
   pressed hand focus on deliberately. */
test('closing the panel after a load hands focus back to the Patterns control', async ({
  page,
}) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await load(page, 'Bossa');

  await expect(page.locator(toggle)).toBeFocused();
});

test('dropping a row leaves focus on the row that takes its place', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await keep(page, 'Funk');

  await remove(page, 'Bossa').click();
  await remove(page, 'Bossa').click();

  await expect(remove(page, 'Funk')).toBeFocused();
});

test('dropping the last row leaves focus in the field, with nowhere else to be', async ({
  page,
}) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await remove(page, 'Bossa').click();
  await remove(page, 'Bossa').click();

  await expect(page.locator(field)).toBeFocused();
});

/* Not a desktop feature: everything in the panel must be readable and hittable
   on the narrowest phone the grid already serves. */
const PHONE = { width: 390, height: 800 };

test('the panel fits a phone, however long a name it is holding', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.locator(toggle).click();

  await keep(page, 'x'.repeat(MAX_NAME_LENGTH));

  const across = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    window: document.documentElement.clientWidth,
  }));
  expect(across.page).toBeLessThanOrEqual(across.window);
});

test('the row keeps its two controls apart at a phone width', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.locator(toggle).click();
  await keep(page, 'x'.repeat(MAX_NAME_LENGTH));

  const loading = await loader(page, 'x'.repeat(MAX_NAME_LENGTH)).boundingBox();
  const dropping = await remove(page, 'x'.repeat(MAX_NAME_LENGTH)).boundingBox();

  expect(loading!.x + loading!.width).toBeLessThanOrEqual(dropping!.x);
});

/* A thumb is a thumb wherever it lands: rows are no smaller a target than the
   controls in the row above. */
test('the panel is as tappable as the controls already in the row', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  const already = (await page.locator(clear).boundingBox())!.height;
  for (const control of [field, save, '[data-patterns="load"]', '[data-patterns="delete"]']) {
    const box = await page.locator(`${panel} ${control}`).first().boundingBox();
    expect(box!.height, control).toBeGreaterThanOrEqual(already);
  }
});

/* The row's mark is drawn, not written, so a reader that cannot see it is
   told in words instead — along with everything else the row says. */
test('every row says its name, its tempo and whether it is the one on the grid', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await retune(page, '140');
  await keep(page, 'Funk');

  await expect(loader(page, 'Funk')).toHaveAccessibleName('Funk, 140 BPM, on the grid');
  await expect(loader(page, 'Bossa')).toHaveAccessibleName(`Load Bossa, ${DEFAULT_TEMPO} BPM`);
  await expect(remove(page, 'Bossa')).toHaveAccessibleName('Delete Bossa');
});

/** Which control the keyboard is on, said the way the panel reads. */
async function reached(page: Page): Promise<string> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (!focused) return 'nothing';
    const part = focused.getAttribute('data-patterns') ?? focused.className;
    const named = focused.closest('[data-pattern]')?.getAttribute('data-pattern');
    return named ? `${part} ${named}` : part;
  });
}

/* Tabbing walks the panel in the order it is read: the field, the button, then
   each row and its delete control in turn. */
test('the panel is reached by keyboard in the order it reads', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await keep(page, 'Funk');
  await startOver(page);
  await tabTo(page, toggle);

  const walk: string[] = [];
  for (let presses = 0; presses < 6; presses += 1) {
    await page.keyboard.press('Tab');
    walk.push(await reached(page));
  }

  expect(walk).toEqual(['name', 'save', 'load Bossa', 'delete Bossa', 'load Funk', 'delete Funk']);
});

test('answers the replace question without a pointer', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');
  await retune(page, '140');
  await startOver(page);

  await tabTo(page, save);
  await page.keyboard.press('Enter');

  await expect(page.locator(save)).toHaveAttribute('data-state', 'asking');

  await page.keyboard.press('Enter');

  await expect(page.locator(rows)).toHaveCount(1);
  await expect(row(page, 'Bossa')).toContainText('140 BPM');
});
