import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { queryE2eDb } from './support/e2e-db.js';
import { signIn } from './support/sign-in.js';

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

const storedPrimaryName = () =>
  queryE2eDb('SELECT name FROM library WHERE id = 2');

async function openRenameRowAsAdmin(page, name = 'Primary') {
  await signIn(page, ACCOUNTS.admin);
  await page.goto('/settings');
  await restingRow(page, name).getByRole('button', { name: 'Rename' }).click();
  await expect(newNameField(page)).toBeVisible();
}

test.afterEach(() => {
  queryE2eDb(
    "UPDATE library SET name = 'Preschool' WHERE id = 1; UPDATE library SET name = 'Primary' WHERE id = 2;",
  );
});

test('US-03: the administrator renames a library', async ({ page }) => {
  await openRenameRowAsAdmin(page);

  await newNameField(page).fill('Primary School');
  await editingRow(page).getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => libraryNames(page)).toContain('Primary School');
  const names = await libraryNames(page);
  expect(names).toContain('Preschool');
  expect(names).not.toContain('Primary');
  expect(names.indexOf('Preschool')).toBeLessThan(
    names.indexOf('Primary School'),
  );
  await expect(newNameField(page)).toHaveCount(0);
});

test('US-03: the rename field is pre-filled', async ({ page }) => {
  await openRenameRowAsAdmin(page);

  await expect(newNameField(page)).toHaveValue('Primary');
  await expect(newNameField(page)).toHaveAttribute('maxlength', '255');
  const row = editingRow(page);
  await expect(row.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Cancel' })).toBeVisible();
});

test('US-03: the conflict is reported in the row', async ({ page }) => {
  await openRenameRowAsAdmin(page);

  await newNameField(page).fill('preschool');
  await editingRow(page).getByRole('button', { name: 'Save' }).click();

  await expect(newNameField(page)).toHaveValue('preschool');
  await expect(editingRow(page).getByRole('alert')).toHaveText(
    'A library named "Preschool" already exists.',
  );
});

test('US-03: saving without a change', async ({ page }) => {
  await openRenameRowAsAdmin(page);

  await editingRow(page).getByRole('button', { name: 'Save' }).click();

  await expect(newNameField(page)).toHaveCount(0);
  expect(await libraryNames(page)).toContain('Primary');
});

test('US-03: the rename is abandoned', async ({ page }) => {
  await openRenameRowAsAdmin(page);

  await newNameField(page).fill('Primary School');
  await editingRow(page).getByRole('button', { name: 'Cancel' }).click();

  await expect(newNameField(page)).toHaveCount(0);
  await expect(restingRow(page, 'Primary')).toBeVisible();
  expect(storedPrimaryName()).toBe('Primary');
});

test('US-03: empty name in the row', async ({ page }) => {
  await openRenameRowAsAdmin(page);

  await newNameField(page).fill('');
  await editingRow(page).getByRole('button', { name: 'Save' }).click();

  await expect(editingRow(page).getByRole('alert')).toHaveText(
    'Enter a name for the library.',
  );
  expect(storedPrimaryName()).toBe('Primary');
});

test('US-03: empty name in the row - only spaces', async ({ page }) => {
  await openRenameRowAsAdmin(page);

  await newNameField(page).fill('   ');
  await editingRow(page).getByRole('button', { name: 'Save' }).click();

  await expect(editingRow(page).getByRole('alert')).toHaveText(
    'Enter a name for the library.',
  );
  expect(storedPrimaryName()).toBe('Primary');
});
