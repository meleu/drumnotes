import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { MAX_NAME_LENGTH } from '../../src/core/library.js';
import { DEFAULT_TEMPO, defaultPattern } from '../../src/core/pattern.js';

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

/** The control that puts a row back on the grid, which asks first when there is
 *  unkept work to lose. */
function loader(page: Page, name: string) {
  return row(page, name).locator('[data-patterns="load"]');
}

/** What it takes to put a kept pattern back on the grid when nothing is at
 *  stake: the grid is empty, or is itself something kept. */
async function load(page: Page, name: string): Promise<void> {
  await loader(page, name).click();
}

/** The same, over work that is kept nowhere: the first press asks, the second
 *  answers. */
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

/* Saving copies out; it changes nothing that is being played. The loop runs on
   through it, unlike a load or a clear. */
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

/* A kept groove cannot be got back once it is gone, and the rows are as wide as
   a thumb: deleting costs two presses, the same as clearing does. */
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

/* What was saved is a copy, so dropping it reaches nothing on the grid — not
   even when the grid is playing the very groove being deleted. */
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

test('takes the question back when it goes unanswered', async ({ page }) => {
  await page.locator(toggle).click();
  await keep(page, 'Bossa');

  await remove(page, 'Bossa').click();
  await expect(remove(page, 'Bossa')).toHaveAttribute('data-state', 'asking');

  // Waits the question out rather than answering it.
  await expect(remove(page, 'Bossa')).toHaveAttribute('data-state', 'idle', { timeout: 15000 });
  await expect(row(page, 'Bossa')).toBeVisible();
});

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

/* Keeping a groove costs one press when no name has been thought of yet: the
   field arrives carrying a name that is free, so the one-press path never runs
   into a question. */
test('the field arrives carrying the first unused name in the series', async ({ page }) => {
  await page.locator(toggle).click();

  await expect(page.locator(field)).toHaveValue('Pattern 1');
});

test('the suggestion is selected, so typing a real name replaces it', async ({ page }) => {
  await page.locator(toggle).click();

  await page.keyboard.type('Bossa');

  await expect(page.locator(field)).toHaveValue('Bossa');
});

/* The whole point of the suggestion: press Patterns, press Save, and the groove
   is kept. Reopening moves the series on rather than offering a taken name. */
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

/* Save is dead in the two cases where it could only do harm: nothing would be
   kept under no name at all, and the library does not fill with empty grooves. */
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

/* A name already kept holds a groove the drummer meant to keep, so writing over
   it costs the same two presses that clearing and deleting do. */
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

/* Names are one identity whatever their case, so a second spelling asks about
   the row it would write over rather than quietly making another. */
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

/* A question is asked about a name, not about the button, so it cannot be
   answered against a name other than the one it was put about. */
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

/* A pattern is always in the same place, so it can be found by reading rather
   than by hunting through the order things happened to be saved in. */
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

/* The row holding what is on the grid says so, so a drummer can tell where they
   are in their own library. Nothing is remembered: the answer is the pattern
   compared against the ones kept, every time it is asked for. */
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

/* The mark is a comparison, not a memory, so a single cell takes it off at
   once — that divergence is the thing the drummer is being shown. */
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

/* Loading throws away whatever is on the grid, so it asks when that is worth
   something: hits that are kept nowhere. The same comparison that marks a row
   decides it, so the two can never disagree. */
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
