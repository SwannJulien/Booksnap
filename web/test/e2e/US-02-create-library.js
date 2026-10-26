import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { queryE2eDb } from './support/e2e-db.js';
import { signIn } from './support/sign-in.js';

const librariesSection = page =>
  page.getByRole('region', { name: 'Libraries' });

const libraryNames = async page => {
  const items = librariesSection(page).getByRole('listitem');
  await expect(items.first()).toBeVisible();
  return (await items.allTextContents()).map(name => name.trim());
};

const libraryCount = () => queryE2eDb('SELECT count(*) FROM library');

async function openAddFormAsAdmin(page) {
  await signIn(page, ACCOUNTS.admin);
  await page.goto('/settings');
  await librariesSection(page)
    .getByRole('button', { name: 'Add a library' })
    .click();
  await expect(librariesSection(page).getByLabel('Name')).toBeVisible();
}

test('US-02: the administrator adds a library', async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await page.goto('/settings');
  const section = librariesSection(page);

  await section.getByRole('button', { name: 'Add a library' }).click();
  await section.getByLabel('Name').fill('Secondary');
  await section.getByRole('button', { name: 'Create' }).click();

  await expect.poll(() => libraryNames(page)).toContain('Secondary');
  const names = await libraryNames(page);
  expect(names).toContain('Preschool');
  expect(names).toContain('Primary');
  expect(names.indexOf('Preschool')).toBeLessThan(names.indexOf('Primary'));
  expect(names.indexOf('Primary')).toBeLessThan(names.indexOf('Secondary'));
  await expect(section.getByLabel('Name')).toHaveCount(0);
});

test('US-02: the duplicate is reported in the form', async ({ page }) => {
  await openAddFormAsAdmin(page);
  const section = librariesSection(page);
  const namesBefore = await libraryNames(page);

  await section.getByLabel('Name').fill('primary');
  await section.getByRole('button', { name: 'Create' }).click();

  await expect(section.getByLabel('Name')).toHaveValue('primary');
  await expect(section.getByRole('alert')).toHaveText(
    'A library named "Primary" already exists.',
  );
  expect(await libraryNames(page)).toEqual(namesBefore);
});

test('US-02: empty name in the form', async ({ page }) => {
  await openAddFormAsAdmin(page);
  const section = librariesSection(page);
  const countBefore = libraryCount();

  await section.getByRole('button', { name: 'Create' }).click();

  await expect(section.getByRole('alert')).toHaveText(
    'Enter a name for the library.',
  );
  expect(libraryCount()).toBe(countBefore);
});

test('US-02: empty name in the form - only spaces', async ({ page }) => {
  await openAddFormAsAdmin(page);
  const section = librariesSection(page);
  const countBefore = libraryCount();

  await section.getByLabel('Name').fill('   ');
  await section.getByRole('button', { name: 'Create' }).click();

  await expect(section.getByRole('alert')).toHaveText(
    'Enter a name for the library.',
  );
  expect(libraryCount()).toBe(countBefore);
});

test('US-02: adding is cancelled', async ({ page }) => {
  await openAddFormAsAdmin(page);
  const section = librariesSection(page);
  const countBefore = libraryCount();

  await section.getByLabel('Name').fill('Secondary');
  await section.getByRole('button', { name: 'Cancel' }).click();

  await expect(section.getByLabel('Name')).toHaveCount(0);
  expect(libraryCount()).toBe(countBefore);
});
