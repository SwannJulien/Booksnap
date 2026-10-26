import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { signIn } from './support/sign-in.js';

const librariesSection = page =>
  page.getByRole('region', { name: 'Libraries' });

async function openSettingsAs(page, account) {
  await signIn(page, account);
  await page.goto('/settings');
}

async function expectNoLibrariesSection(page) {
  await expect(
    page.getByRole('heading', { name: 'Settings View' }),
  ).toBeVisible();
  await expect(librariesSection(page)).toHaveCount(0);
}

test('US-01: the administrator sees the libraries in Settings', async ({
  page,
}) => {
  await openSettingsAs(page, ACCOUNTS.admin);

  const items = librariesSection(page).getByRole('listitem');
  await expect(items.first()).toBeVisible();
  const names = (await items.allTextContents()).map(name => name.trim());
  expect(names).toContain('Preschool');
  expect(names).toContain('Primary');
  expect(names.indexOf('Preschool')).toBeLessThan(names.indexOf('Primary'));
});

test('US-01: no library', async ({ page }) => {
  await page.route('**/api/v1/libraries', route => route.fulfill({ json: [] }));

  await openSettingsAs(page, ACCOUNTS.admin);

  await expect(
    librariesSection(page).getByText('No library yet.'),
  ).toBeVisible();
  await expect(librariesSection(page).getByRole('listitem')).toHaveCount(0);
});

test('US-01: the list cannot be loaded', async ({ page }) => {
  await page.route('**/api/v1/libraries', route =>
    route.fulfill({ status: 500, body: '{}' }),
  );

  await openSettingsAs(page, ACCOUNTS.admin);

  await expect(librariesSection(page).getByRole('alert')).toHaveText(
    'The libraries could not be loaded.',
  );
});

test('US-01: a librarian does not see the section', async ({ page }) => {
  await openSettingsAs(page, ACCOUNTS.librarian);

  await expectNoLibrariesSection(page);
});

test('US-01: a student does not see the section', async ({ page }) => {
  await openSettingsAs(page, ACCOUNTS.user);

  await expectNoLibrariesSection(page);
});
