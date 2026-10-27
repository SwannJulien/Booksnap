import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { queryE2eDb } from './support/e2e-db.js';
import { uniqueTitle } from './support/lifecycle-fixtures.js';
import { signIn } from './support/sign-in.js';

const SUBTITLE =
  'How long each library lends a copy and keeps one aside for a hold.';
const DEFAULT_RULES = 'Loan 14 days · Pickup 7 days';
const RANGE_ERROR = 'Enter a whole number of days between 1 and 365.';

const loanRulesSection = page =>
  page.getByRole('region', { name: 'Loan rules' });

const librariesSection = page =>
  page.getByRole('region', { name: 'Libraries' });

const loanField = scope =>
  scope.getByRole('spinbutton', { name: 'Loan', exact: true });

const pickupField = scope =>
  scope.getByRole('spinbutton', { name: 'Pickup', exact: true });

const ruleRow = (page, name) =>
  loanRulesSection(page).getByRole('listitem').filter({ hasText: name });

const editingRow = page =>
  loanRulesSection(page)
    .getByRole('listitem')
    .filter({ has: loanField(page) });

const storedPrimaryRules = () =>
  queryE2eDb(
    "SELECT borrowing_duration_days || '|' || pickup_window_days FROM library WHERE name = 'Primary'",
  );

async function openSettingsAs(page, account) {
  await signIn(page, account);
  await page.goto('/settings');
}

async function editPrimary(page) {
  await ruleRow(page, 'Primary')
    .getByRole('button', { name: 'Edit loan rules' })
    .click();
  await expect(loanField(page)).toBeVisible();
}

test.afterEach(() => {
  queryE2eDb(
    'UPDATE library SET borrowing_duration_days = 14, pickup_window_days = 7',
  );
});

test("US-01: an administrator sees each library's loan rules", async ({
  page,
}) => {
  await openSettingsAs(page, ACCOUNTS.admin);
  const section = loanRulesSection(page);

  await expect(
    section.getByRole('heading', { level: 2, name: 'Loan rules' }),
  ).toBeVisible();
  await expect(section.locator('p', { hasText: SUBTITLE })).toBeVisible();
  await expect(ruleRow(page, 'Preschool')).toContainText(DEFAULT_RULES);
  await expect(ruleRow(page, 'Primary')).toContainText(DEFAULT_RULES);
  const libraries = await librariesSection(page).boundingBox();
  const loanRules = await section.boundingBox();
  expect(loanRules.y).toBeGreaterThanOrEqual(libraries.y + libraries.height);
});

test('US-01: a value of one day is written in the singular', async ({
  page,
}) => {
  queryE2eDb(
    "UPDATE library SET borrowing_duration_days = 1, pickup_window_days = 1 WHERE name = 'Primary'",
  );

  await openSettingsAs(page, ACCOUNTS.admin);

  await expect(ruleRow(page, 'Primary')).toContainText(
    'Loan 1 day · Pickup 1 day',
  );
});

test('US-01: a created library starts at 14 and 7 days', async ({ page }) => {
  const name = uniqueTitle('Secondary');
  try {
    await openSettingsAs(page, ACCOUNTS.admin);
    const libraries = librariesSection(page);

    await libraries.getByRole('button', { name: 'Add a library' }).click();
    await libraries.getByLabel('Name').fill(name);
    await libraries.getByRole('button', { name: 'Create' }).click();

    await expect(ruleRow(page, name)).toContainText(DEFAULT_RULES);
  } finally {
    queryE2eDb(`DELETE FROM library WHERE name = '${name}'`);
  }
});

test('US-01: the administrator changes the rules of a library', async ({
  page,
}) => {
  await openSettingsAs(page, ACCOUNTS.admin);
  await editPrimary(page);

  await loanField(page).fill('21');
  await pickupField(page).fill('3');
  await editingRow(page).getByRole('button', { name: 'Save' }).click();

  await expect(ruleRow(page, 'Primary')).toContainText(
    'Loan 21 days · Pickup 3 days',
  );
  await expect(ruleRow(page, 'Preschool')).toContainText(DEFAULT_RULES);
  await page.reload();
  await expect(ruleRow(page, 'Primary')).toContainText(
    'Loan 21 days · Pickup 3 days',
  );
});

test('US-01: the form opens on the current values', async ({ page }) => {
  queryE2eDb(
    "UPDATE library SET borrowing_duration_days = 21, pickup_window_days = 3 WHERE name = 'Primary'",
  );
  await openSettingsAs(page, ACCOUNTS.admin);

  await editPrimary(page);

  await expect(loanField(page)).toHaveValue('21');
  await expect(pickupField(page)).toHaveValue('3');
});

test('US-01: the change is abandoned', async ({ page }) => {
  await openSettingsAs(page, ACCOUNTS.admin);
  await editPrimary(page);

  await loanField(page).fill('30');
  await editingRow(page).getByRole('button', { name: 'Cancel' }).click();

  await expect(loanField(page)).toHaveCount(0);
  await expect(ruleRow(page, 'Primary')).toContainText(DEFAULT_RULES);
  expect(storedPrimaryRules()).toBe('14|7');
});

[
  ['0', '0'],
  ['366', '366'],
  ['-3', '-3'],
  ['2.5', '2.5'],
  ['(empty)', ''],
].forEach(([label, value]) => {
  test(`US-01: an out-of-range value is reported in the form - ${label}`, async ({
    page,
  }) => {
    await openSettingsAs(page, ACCOUNTS.admin);
    await editPrimary(page);

    await loanField(page).fill(value);
    await pickupField(page).fill('7');
    await editingRow(page).getByRole('button', { name: 'Save' }).click();

    await expect(editingRow(page).getByRole('alert')).toHaveText(RANGE_ERROR);
    await expect(loanField(page)).toBeVisible();
    await expect(pickupField(page)).toBeVisible();
    await page.reload();
    await expect(ruleRow(page, 'Primary')).toContainText(DEFAULT_RULES);
  });
});

test('US-01: the librarian sees the loan rules without being able to change them', async ({
  page,
}) => {
  queryE2eDb(
    "UPDATE library SET borrowing_duration_days = 21, pickup_window_days = 3 WHERE name = 'Primary'",
  );

  await openSettingsAs(page, ACCOUNTS.librarian);
  const section = loanRulesSection(page);

  await expect(section).toBeVisible();
  await expect(section.locator('p', { hasText: SUBTITLE })).toBeVisible();
  await expect(ruleRow(page, 'Preschool')).toContainText(DEFAULT_RULES);
  await expect(ruleRow(page, 'Primary')).toContainText(
    'Loan 21 days · Pickup 3 days',
  );
  await expect(
    page.getByRole('button', { name: 'Edit loan rules' }),
  ).toHaveCount(0);
  await expect(librariesSection(page)).toHaveCount(0);
});
