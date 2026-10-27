import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { queryE2eDb } from './support/e2e-db.js';
import { signIn } from './support/sign-in.js';

const SUBTITLE = "Add the school's libraries and rename them.";
const MAX_CONTROL_HEIGHT = 40;
const CENTER_TOLERANCE = 2;

const librariesSection = page =>
  page.getByRole('region', { name: 'Libraries' });

const newNameField = scope =>
  scope.getByRole('textbox', { name: 'New name', exact: true });

const restingRow = (page, name) =>
  librariesSection(page)
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });

const editingRow = page =>
  librariesSection(page)
    .getByRole('listitem')
    .filter({ has: newNameField(page) });

const libraryNames = async page => {
  const items = librariesSection(page).getByRole('listitem');
  await expect(items.first()).toBeVisible();
  return (await items.allTextContents()).map(name => name.trim());
};

const centerY = box => box.y + box.height / 2;

async function openSettingsAs(page, account) {
  await signIn(page, account);
  await page.goto('/settings');
}

async function measure(page, ...locators) {
  await page.evaluate(() => document.fonts.ready);
  await Promise.all(locators.map(locator => expect(locator).toBeVisible()));
  return Promise.all(locators.map(locator => locator.boundingBox()));
}

function expectSameLine(boxes) {
  const centers = boxes.map(centerY);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(
    CENTER_TOLERANCE,
  );
}

test.afterEach(() => {
  queryE2eDb(
    "UPDATE library SET name = 'Preschool' WHERE id = 1; UPDATE library SET name = 'Primary' WHERE id = 2;",
  );
});

test('US-01: the page title is Settings', async ({ page }) => {
  await openSettingsAs(page, ACCOUNTS.admin);

  await expect(
    page.getByRole('heading', { level: 1, name: 'Settings', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Settings View' }),
  ).toHaveCount(0);
});

test('US-01: the Libraries section has a subtitle', async ({ page }) => {
  await openSettingsAs(page, ACCOUNTS.admin);
  const section = librariesSection(page);

  const subtitle = section.locator('p', { hasText: SUBTITLE });
  await expect(subtitle).toBeVisible();
  const [title, subtitleBox, list] = await measure(
    page,
    section.getByRole('heading', { name: 'Libraries' }),
    subtitle,
    section.getByRole('list'),
  );
  expect(subtitleBox.y).toBeGreaterThan(title.y);
  expect(list.y).toBeGreaterThan(subtitleBox.y);
});

test('US-01: the subtitle stays shown when the list is empty', async ({
  page,
}) => {
  await page.route('**/api/v1/libraries', route => route.fulfill({ json: [] }));

  await openSettingsAs(page, ACCOUNTS.admin);
  const section = librariesSection(page);

  await expect(section.getByText('No library yet.')).toBeVisible();
  await expect(section.locator('p', { hasText: SUBTITLE })).toBeVisible();
});

test('US-01: the subtitle stays shown when the list cannot be loaded', async ({
  page,
}) => {
  await page.route('**/api/v1/libraries', route =>
    route.fulfill({ status: 500, body: '{}' }),
  );

  await openSettingsAs(page, ACCOUNTS.admin);
  const section = librariesSection(page);

  await expect(section.getByRole('alert')).toHaveText(
    'The libraries could not be loaded.',
  );
  await expect(section.locator('p', { hasText: SUBTITLE })).toBeVisible();
});

test('US-01: a non-admin sees neither the section nor its subtitle', async ({
  page,
}) => {
  await openSettingsAs(page, ACCOUNTS.librarian);

  await expect(
    page.getByRole('heading', { level: 1, name: 'Settings', exact: true }),
  ).toBeVisible();
  await expect(librariesSection(page)).toHaveCount(0);
  await expect(page.getByText(SUBTITLE)).toHaveCount(0);
});

test('US-01: a library row shows the name and a pencil', async ({ page }) => {
  await openSettingsAs(page, ACCOUNTS.admin);

  const row = restingRow(page, 'Primary');
  const pencil = row.getByRole('button', { name: 'Rename' });
  await expect(pencil).toBeVisible();
  await expect(row).toHaveText('Primary');
  await expect(pencil).toHaveAttribute('title', 'Rename');
  const icon = pencil.locator('svg');
  await expect(icon).toHaveCount(1);
  expect(
    await icon.evaluate(element => !!element.closest('[aria-hidden="true"]')),
  ).toBe(true);
});

test('US-01: the pencil is discreet, aligned with the name, at the right end of the row', async ({
  page,
}) => {
  await openSettingsAs(page, ACCOUNTS.admin);

  const row = restingRow(page, 'Primary');
  const [pencil, name, rowBox] = await measure(
    page,
    row.getByRole('button', { name: 'Rename' }),
    row.locator('.library-name'),
    row,
  );

  expect(pencil.height).toBeLessThanOrEqual(MAX_CONTROL_HEIGHT);
  expectSameLine([pencil, name]);
  expect(pencil.x).toBeGreaterThanOrEqual(name.x + name.width);
  expect(
    Math.abs(pencil.x + pencil.width - (rowBox.x + rowBox.width)),
  ).toBeLessThanOrEqual(CENTER_TOLERANCE);
});

test('US-01: the pencil can be activated with the keyboard', async ({
  page,
}) => {
  await openSettingsAs(page, ACCOUNTS.admin);
  const previousPencil = restingRow(page, 'Preschool').getByRole('button', {
    name: 'Rename',
  });
  const pencil = restingRow(page, 'Primary').getByRole('button', {
    name: 'Rename',
  });

  await previousPencil.focus();
  await page.keyboard.press('Tab');

  await expect(pencil).toBeFocused();
  expect(
    await pencil.evaluate(button => button.matches(':focus-visible')),
  ).toBe(true);
  await page.keyboard.press('Enter');

  await expect(newNameField(page)).toHaveValue('Primary');
  const row = editingRow(page);
  await expect(row.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Cancel' })).toBeVisible();
});

test('US-01: renaming fits on one line', async ({ page }) => {
  await openSettingsAs(page, ACCOUNTS.admin);
  await restingRow(page, 'Primary')
    .getByRole('button', { name: 'Rename' })
    .click();

  const row = editingRow(page);
  const [field, save, cancel] = await measure(
    page,
    newNameField(page),
    row.getByRole('button', { name: 'Save' }),
    row.getByRole('button', { name: 'Cancel' }),
  );

  expectSameLine([field, save, cancel]);
  expect(save.height).toBeLessThanOrEqual(MAX_CONTROL_HEIGHT);
  expect(cancel.height).toBeLessThanOrEqual(MAX_CONTROL_HEIGHT);
});

test('US-01: the add form fits on one line', async ({ page }) => {
  await openSettingsAs(page, ACCOUNTS.admin);
  const section = librariesSection(page);

  await section.getByRole('button', { name: 'Add a library' }).click();
  const [label, field, create, cancel] = await measure(
    page,
    section.locator('label[for="library-name"]'),
    section.getByRole('textbox', { name: 'Name', exact: true }),
    section.getByRole('button', { name: 'Create' }),
    section.getByRole('button', { name: 'Cancel' }),
  );

  expectSameLine([label, field, create, cancel]);
  expect(create.height).toBeLessThanOrEqual(MAX_CONTROL_HEIGHT);
  expect(cancel.height).toBeLessThanOrEqual(MAX_CONTROL_HEIGHT);
});

test('US-01: renaming works as before', async ({ page }) => {
  await openSettingsAs(page, ACCOUNTS.admin);

  await restingRow(page, 'Primary')
    .getByRole('button', { name: 'Rename' })
    .click();
  await newNameField(page).fill('Primary School');
  await editingRow(page).getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => libraryNames(page)).toContain('Primary School');
  const names = await libraryNames(page);
  expect(names.indexOf('Preschool')).toBeGreaterThanOrEqual(0);
  expect(names.indexOf('Preschool')).toBeLessThan(
    names.indexOf('Primary School'),
  );
  await expect(
    restingRow(page, 'Primary School').getByRole('button', { name: 'Rename' }),
  ).toBeVisible();
});
