import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { queryE2eDb } from './support/e2e-db.js';
import { signIn } from './support/sign-in.js';

const BOOTSTRAP_ADMIN_EMAIL = 'admin@admin.com';
const DANIEL_EMAIL = 'daniel.smith@example.com';
const FILLER_DOMAIN = 'users-view.e2e';
const SUBTITLE = 'Every student and staff member who has an account.';
const NO_RESULT = 'No account matches your search.';
const LOAD_FAILURE = 'The accounts could not be loaded.';

test.afterEach(() => {
  queryE2eDb(
    `DELETE FROM users WHERE email = '${BOOTSTRAP_ADMIN_EMAIL}' OR email LIKE '%@${FILLER_DOMAIN}'; UPDATE users SET is_active = true WHERE email = '${DANIEL_EMAIL}'`,
  );
});

const usersView = page => page.locator('users-view');
const accountRows = page => usersView(page).locator('tr:has(td)');
const rowOf = (page, text) => accountRows(page).filter({ hasText: text });
const searchBox = page =>
  page.getByRole('searchbox', { name: 'Search by name or email' });
const roleFilter = page =>
  page.getByRole('combobox', { name: 'Role', exact: true });
const statusFilter = page =>
  page.getByRole('combobox', { name: 'Status', exact: true });
const usersHeading = page =>
  page.getByRole('heading', { level: 1, name: 'Users', exact: true });
const usersLink = page =>
  page.getByRole('link', { name: 'Users', exact: true });

const pageSummary = page =>
  usersView(page)
    .locator('pagination-bks')
    .getByText(/Showing \d+ to \d+ of \d+ results/);

const countAccounts = condition =>
  Number(queryE2eDb(`SELECT count(*) FROM users WHERE ${condition}`));

async function expectTotal(page, total) {
  await expect(pageSummary(page)).toContainText(`of ${total} results`);
}

async function listedNames(page, collected = []) {
  const next = usersView(page)
    .locator('pagination-bks')
    .getByRole('button', { name: 'Next' });
  const cells = await accountRows(page)
    .locator('td:first-child')
    .allTextContents();
  const names = [...collected, ...cells.map(name => name.trim())];
  if (await next.isDisabled()) {
    return names;
  }
  const shown = await pageSummary(page).innerText();
  await next.click();
  await expect(pageSummary(page)).not.toHaveText(shown);
  return listedNames(page, names);
}

async function openUsersAs(page, account) {
  await signIn(page, account);
  await page.goto('/users');
}

function deactivateDaniel() {
  queryE2eDb(
    `UPDATE users SET is_active = false WHERE email = '${DANIEL_EMAIL}'`,
  );
}

test('US-01: the administrator opens the accounts view', async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);

  await usersLink(page).click();

  await expect(usersHeading(page)).toBeVisible();
  await expect(
    usersView(page).locator('p', { hasText: SUBTITLE }),
  ).toBeVisible();
  await expect(usersView(page).getByRole('columnheader')).toHaveText([
    'Name',
    'Email',
    'Role',
    'Status',
  ]);

  await searchBox(page).fill(ACCOUNTS.admin.email);
  await expect(rowOf(page, ACCOUNTS.admin.email).locator('td')).toHaveText([
    'Alice Martin',
    'alice.martin@example.com',
    'Admin',
    'Active',
  ]);

  await searchBox(page).fill(ACCOUNTS.librarian.email);
  await expect(
    rowOf(page, ACCOUNTS.librarian.email).locator('td').nth(2),
  ).toHaveText('Librarian');

  await searchBox(page).fill(ACCOUNTS.user.email);
  await expect(
    rowOf(page, ACCOUNTS.user.email).locator('td').nth(2),
  ).toHaveText('Student');
});

test('US-01: accounts are sorted by name', async ({ page }) => {
  await openUsersAs(page, ACCOUNTS.admin);
  await expectTotal(page, countAccounts('is_active = true'));

  const names = await listedNames(page);

  const clara = names.indexOf('Clara Dupont');
  const alice = names.indexOf('Alice Martin');
  const daniel = names.indexOf('Daniel Smith');
  expect(clara).toBeGreaterThanOrEqual(0);
  expect(clara).toBeLessThan(alice);
  expect(alice).toBeLessThan(daniel);
});

test('US-01: an account without a name shows a dash', async ({ page }) => {
  queryE2eDb(
    `INSERT INTO users (email, role) VALUES ('${BOOTSTRAP_ADMIN_EMAIL}', 'admin')`,
  );
  await openUsersAs(page, ACCOUNTS.admin);

  await searchBox(page).fill(BOOTSTRAP_ADMIN_EMAIL);

  const row = rowOf(page, BOOTSTRAP_ADMIN_EMAIL);
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(0)).toHaveText('—');
  await expect(row.locator('td').nth(1)).toHaveText(BOOTSTRAP_ADMIN_EMAIL);
});

for (const term of ['ALI', 'art', 'MARTIN@EXAMPLE']) {
  test(`US-01: search matches first name, last name and email, ignoring case [${term}]`, async ({
    page,
  }) => {
    await openUsersAs(page, ACCOUNTS.admin);

    await searchBox(page).fill(term);

    await expect(rowOf(page, 'Alice Martin')).toBeVisible();
    await expect(rowOf(page, 'Clara Dupont')).toHaveCount(0);
  });
}

test('US-01: a search without results', async ({ page }) => {
  await openUsersAs(page, ACCOUNTS.admin);

  await searchBox(page).fill('zzzz');

  await expect(usersView(page).getByText(NO_RESULT)).toBeVisible();
  await expect(accountRows(page)).toHaveCount(0);
});

test('US-01: filter by role', async ({ page }) => {
  await openUsersAs(page, ACCOUNTS.admin);

  await roleFilter(page).selectOption({ label: 'Librarian' });

  await expectTotal(
    page,
    countAccounts("is_active = true AND role = 'librarian'"),
  );
  await expect(rowOf(page, 'Bob Johnson')).toBeVisible();
  await expect(rowOf(page, 'Alice Martin')).toHaveCount(0);
  await expect(rowOf(page, 'Clara Dupont')).toHaveCount(0);
});

test('US-01: deactivated accounts are hidden by default', async ({ page }) => {
  deactivateDaniel();

  await openUsersAs(page, ACCOUNTS.admin);

  await expect(statusFilter(page).locator('option:checked')).toHaveText(
    'Active',
  );
  await expectTotal(page, countAccounts('is_active = true'));
  const names = await listedNames(page);
  expect(names).toContain('Clara Dupont');
  expect(names).not.toContain('Daniel Smith');
});

test('US-01: see deactivated accounts', async ({ page }) => {
  deactivateDaniel();
  await openUsersAs(page, ACCOUNTS.admin);

  await statusFilter(page).selectOption({ label: 'Deactivated' });

  await expectTotal(page, countAccounts('is_active IS NOT TRUE'));
  await expect(rowOf(page, 'Daniel Smith')).toContainText('Deactivated');
  await expect(rowOf(page, 'Clara Dupont')).toHaveCount(0);

  await statusFilter(page).selectOption({ label: 'All statuses' });

  await expectTotal(page, countAccounts('true'));
  const names = await listedNames(page);
  expect(names).toContain('Daniel Smith');
  expect(names).toContain('Clara Dupont');
});

test('US-01: the list is paginated', async ({ page }) => {
  const total = 25;
  const active = Number(
    queryE2eDb('SELECT count(*) FROM users WHERE is_active = true'),
  );
  if (active > total) {
    throw new Error(
      `${active} active accounts already exist, expected at most ${total}`,
    );
  }
  const values = Array.from(
    { length: total - active },
    (_, index) =>
      `('Filler${index}', 'Student', 'filler${index}@${FILLER_DOMAIN}')`,
  ).join(', ');
  if (values) {
    queryE2eDb(
      `INSERT INTO users (first_name, last_name, email) VALUES ${values}`,
    );
  }

  await openUsersAs(page, ACCOUNTS.admin);

  const pagination = usersView(page).locator('pagination-bks');
  const next = pagination.getByRole('button', { name: 'Next' });
  await expect(accountRows(page)).toHaveCount(10);
  await expect(next).toBeEnabled();

  await next.click();
  await expect(pagination).toContainText('Showing 11 to 20 of 25 results');
  await expect(accountRows(page)).toHaveCount(10);
  await expect(next).toBeEnabled();

  await next.click();
  await expect(pagination).toContainText('Showing 21 to 25 of 25 results');
  await expect(accountRows(page)).toHaveCount(5);
  await expect(next).toBeDisabled();
});

test('US-01: the list fails to load', async ({ page }) => {
  await page.route(
    url => new URL(url).pathname === '/api/v1/users',
    route => route.fulfill({ status: 500, body: '{}' }),
  );

  await openUsersAs(page, ACCOUNTS.admin);

  await expect(
    page.getByRole('alert').filter({ hasText: LOAD_FAILURE }),
  ).toBeVisible();
});

test('US-01: non-admin staff do not see the navigation entry', async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.librarian);

  await expect(
    page.getByRole('link', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await expect(usersLink(page)).toHaveCount(0);
});

test('US-01: a non-admin opening the address is sent home', async ({
  page,
}) => {
  await openUsersAs(page, ACCOUNTS.librarian);

  await expect(page).toHaveURL(url => new URL(url).pathname === '/');
  await expect(usersHeading(page)).toHaveCount(0);
});
