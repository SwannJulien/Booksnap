import { test, expect } from '@playwright/test';
import { ACCOUNTS, E2E_PASSWORD } from './support/accounts.js';
import { queryE2eDb } from './support/e2e-db.js';
import {
  borrow,
  copyRow,
  createBook,
  expandBook,
  giveBack,
  openSession,
  searchCatalogFor,
} from './support/lifecycle-fixtures.js';
import { signIn } from './support/sign-in.js';

const CLARA_EMAIL = ACCOUNTS.user.email;
const BOB_EMAIL = ACCOUNTS.librarian.email;
const ALICE_EMAIL = ACCOUNTS.admin.email;
const BOB_NEW_EMAIL = 'b.johnson@example.com';
const ALICE_NEW_EMAIL = 'a.martin@example.com';

const REQUIRED = 'This field is required.';
const INVALID_EMAIL = 'Enter a valid email address.';
const EMAIL_TAKEN = 'An account already uses this email.';
const INVALID_CREDENTIALS = 'Email or password is incorrect.';
const SESSION_EXPIRED =
  'Your session has expired. Sign in again to carry on where you left off.';

const ids = {};

test.beforeAll(() => {
  const idOf = email =>
    Number(queryE2eDb(`SELECT id FROM users WHERE email = '${email}'`));
  ids.clara = idOf(CLARA_EMAIL);
  ids.bob = idOf(BOB_EMAIL);
  ids.alice = idOf(ALICE_EMAIL);
});

test.afterEach(() => {
  queryE2eDb(
    `UPDATE users SET first_name = 'Clara', last_name = 'Dupont', email = '${CLARA_EMAIL}', key_stage = 'ks_1', house = 'Picasso', genre = 'female', parent_email = 'parent.dupont@example.com' WHERE id = ${ids.clara}; UPDATE users SET first_name = 'Bob', email = '${BOB_EMAIL}' WHERE id = ${ids.bob}; UPDATE users SET email = '${ALICE_EMAIL}' WHERE id = ${ids.alice}`,
  );
});

const modal = page => page.locator('account-modal-bks');
const field = (page, label) => modal(page).getByLabel(label, { exact: true });
const modalHeading = page =>
  page.getByRole('heading', { level: 2, name: 'Edit account', exact: true });
const saveButton = page =>
  page.getByRole('button', { name: 'Save', exact: true });
const cancelButton = page =>
  page.getByRole('button', { name: 'Cancel', exact: true });
const searchBox = page =>
  page.getByRole('searchbox', { name: 'Search by name or email' });
const archiveLink = page =>
  page.getByRole('link', { name: 'Archive', exact: true });
const historyModal = page => page.locator('history-modal-bks');

const claraRecord = () =>
  queryE2eDb(
    `SELECT first_name || '|' || last_name || '|' || email || '|' || key_stage || '|' || house FROM users WHERE id = ${ids.clara}`,
  );
const CLARA_UNCHANGED = `Clara|Dupont|${CLARA_EMAIL}|ks_1|Picasso`;

async function openUsersAsAdmin(page) {
  await signIn(page, ACCOUNTS.admin);
  await page.goto('/users');
}

async function findAccountRow(page, email) {
  await searchBox(page).fill(email);
  const row = page
    .locator('users-view')
    .locator('tr:has(td)')
    .filter({ hasText: email });
  await expect(row).toHaveCount(1);
  return row;
}

async function openEditFor(page, email) {
  const row = await findAccountRow(page, email);
  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(modalHeading(page)).toBeVisible();
}

async function openEditAsAdmin(page, email) {
  await openUsersAsAdmin(page);
  await openEditFor(page, email);
}

async function editAndSave(page, email, changes) {
  await openEditFor(page, email);
  await Promise.all(
    Object.entries(changes).map(([label, value]) =>
      field(page, label).fill(value),
    ),
  );
  await saveButton(page).click();
}

async function attemptSignIn(page, email) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function expectSessionClosed(page) {
  await archiveLink(page).click();
  await expect(page).toHaveURL(url => url.pathname === '/login');
  await expect(page.getByText(SESSION_EXPIRED)).toBeVisible();
}

test('US-03: the form opens on the account values', async ({ page }) => {
  await openEditAsAdmin(page, CLARA_EMAIL);

  await expect(field(page, 'First name')).toHaveValue('Clara');
  await expect(field(page, 'Last name')).toHaveValue('Dupont');
  await expect(field(page, 'Email')).toHaveValue(CLARA_EMAIL);
  await expect(field(page, 'Key stage').locator('option:checked')).toHaveText(
    'KS-1',
  );
  await expect(field(page, 'House')).toHaveValue('Picasso');
  await expect(field(page, 'Role')).toHaveCount(0);
  await expect(modal(page).locator('input[type=password]')).toHaveCount(0);
});

test('US-03: the administrator moves a student to the next key stage', async ({
  page,
}) => {
  await openEditAsAdmin(page, CLARA_EMAIL);

  await field(page, 'Key stage').selectOption({ label: 'KS-2' });
  await saveButton(page).click();

  await expect(modalHeading(page)).toBeHidden();
  await page.reload();
  await openEditFor(page, CLARA_EMAIL);
  await expect(field(page, 'Key stage')).toHaveValue('ks_2');
  await expect(field(page, 'Key stage').locator('option:checked')).toHaveText(
    'KS-2',
  );
});

test('US-03: correcting a name', async ({ page }) => {
  await openEditAsAdmin(page, CLARA_EMAIL);

  await field(page, 'Last name').fill('Dupond');
  await saveButton(page).click();

  await expect(modalHeading(page)).toBeHidden();
  const row = await findAccountRow(page, CLARA_EMAIL);
  await expect(row.locator('td').nth(0)).toHaveText('Clara Dupond');
});

test('US-03: the journal keeps the values of the time', async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  const book = await createBook(page, 'US-03 Journal');
  const borrowing = await borrow(page, book.copyId);
  await giveBack(page, borrowing.id);
  await page.goto('/users');

  await openEditFor(page, CLARA_EMAIL);
  await field(page, 'Last name').fill('Dupond');
  await field(page, 'Key stage').selectOption({ label: 'KS-2' });
  await saveButton(page).click();
  await expect(modalHeading(page)).toBeHidden();

  await searchCatalogFor(page, book.title);
  await expandBook(page, book.title);
  await copyRow(page, book.code)
    .getByRole('button', { name: 'More actions' })
    .click();
  await page.getByRole('menuitem', { name: 'View history' }).click();
  await expect(
    historyModal(page)
      .locator('tbody tr')
      .filter({ hasText: 'Borrowed by Clara Dupont' }),
  ).toHaveCount(1);
  expect(
    queryE2eDb(
      `SELECT student_key_stage FROM lifecycle_event WHERE copy_id = ${book.copyId} AND type = 'borrowed'`,
    ),
  ).toBe('ks_1');
});

test('US-03: clearing an optional field erases it', async ({ page }) => {
  await openEditAsAdmin(page, CLARA_EMAIL);

  await field(page, 'House').fill('');
  await saveButton(page).click();

  await expect(modalHeading(page)).toBeHidden();
  expect(
    queryE2eDb(`SELECT house IS NULL FROM users WHERE id = ${ids.clara}`),
  ).toBe('t');
});

test('US-03: changing the email of a staff member', async ({
  page,
  browser,
}) => {
  const bob = await openSession(browser, ACCOUNTS.librarian);

  try {
    await openUsersAsAdmin(page);
    await editAndSave(page, BOB_EMAIL, { Email: BOB_NEW_EMAIL });
    await expect(modalHeading(page)).toBeHidden();

    await expectSessionClosed(bob.page);
    await attemptSignIn(bob.page, BOB_EMAIL);
    await expect(bob.page.getByText(INVALID_CREDENTIALS)).toBeVisible();
    await signIn(bob.page, { email: BOB_NEW_EMAIL });
    await expect(bob.page).not.toHaveURL(url => url.pathname === '/login');
  } finally {
    await bob.context.close();
  }
});

test('US-03: changing only the case of an email closes the sessions', async ({
  page,
  browser,
}) => {
  const bob = await openSession(browser, ACCOUNTS.librarian);

  try {
    await openUsersAsAdmin(page);
    await editAndSave(page, BOB_EMAIL, { Email: 'Bob.Johnson@example.com' });
    await expect(modalHeading(page)).toBeHidden();

    await expectSessionClosed(bob.page);
  } finally {
    await bob.context.close();
  }
});

test('US-03: changing another field does not close the sessions', async ({
  page,
  browser,
}) => {
  const bob = await openSession(browser, ACCOUNTS.librarian);

  try {
    await openUsersAsAdmin(page);
    await editAndSave(page, BOB_EMAIL, { 'First name': 'Robert' });
    await expect(modalHeading(page)).toBeHidden();

    await archiveLink(bob.page).click();
    await expect(bob.page).toHaveURL(url => url.pathname === '/archive');
    await expect(
      bob.page.getByRole('region', { name: 'Deleted books' }),
    ).toBeVisible();
    const me = await bob.page.request.get('/api/v1/auth/me');
    expect(me.status()).toBe(200);
    await expect(bob.page).not.toHaveURL(url => url.pathname === '/login');
  } finally {
    await bob.context.close();
  }
});

test('US-03: the administrator changes their own email', async ({ page }) => {
  await openUsersAsAdmin(page);

  await editAndSave(page, ALICE_EMAIL, { Email: ALICE_NEW_EMAIL });

  await expect(page).toHaveURL(url => url.pathname === '/login');
  await expect(page.getByText(SESSION_EXPIRED)).toBeVisible();
  await signIn(page, { email: ALICE_NEW_EMAIL });
  await expect(page).not.toHaveURL(url => url.pathname === '/login');
});

test('US-03: the email of another account is refused, whatever the case', async ({
  page,
}) => {
  await openUsersAsAdmin(page);

  await editAndSave(page, CLARA_EMAIL, { Email: 'Daniel.Smith@example.com' });

  await expect(modalHeading(page)).toBeVisible();
  await expect(field(page, 'Email')).toHaveAccessibleDescription(EMAIL_TAKEN);
  expect(queryE2eDb(`SELECT email FROM users WHERE id = ${ids.clara}`)).toBe(
    CLARA_EMAIL,
  );
});

test('US-03: changing only the case of its own email is accepted', async ({
  page,
}) => {
  await openUsersAsAdmin(page);

  await editAndSave(page, CLARA_EMAIL, { Email: 'Clara.Dupont@example.com' });

  await expect(modalHeading(page)).toBeHidden();
  const row = await findAccountRow(page, CLARA_EMAIL);
  await expect(row.locator('td').nth(1)).toHaveText('Clara.Dupont@example.com');
});

const REQUIRED_FIELDS = [
  { label: 'First name', blank: page => field(page, 'First name').fill('') },
  { label: 'Email', blank: page => field(page, 'Email').fill('') },
  {
    label: 'Key stage',
    blank: page => field(page, 'Key stage').selectOption(''),
  },
];

for (const { label, blank } of REQUIRED_FIELDS) {
  test(`US-03: an emptied required field is refused [${label}]`, async ({
    page,
  }) => {
    await openEditAsAdmin(page, CLARA_EMAIL);

    await blank(page);
    await saveButton(page).click();

    await expect(modalHeading(page)).toBeVisible();
    await expect(field(page, label)).toHaveAccessibleDescription(REQUIRED);
    expect(claraRecord()).toBe(CLARA_UNCHANGED);
  });
}

test('US-03: an invalid address is refused', async ({ page }) => {
  await openEditAsAdmin(page, CLARA_EMAIL);

  await field(page, 'Email').fill('clara@');
  await saveButton(page).click();

  await expect(modalHeading(page)).toBeVisible();
  await expect(field(page, 'Email')).toHaveAccessibleDescription(INVALID_EMAIL);
  expect(claraRecord()).toBe(CLARA_UNCHANGED);
});

test('US-03: abandoning the edit', async ({ page }) => {
  await openEditAsAdmin(page, CLARA_EMAIL);

  await field(page, 'Last name').fill('Dupond');
  await cancelButton(page).click();

  await expect(modalHeading(page)).toBeHidden();
  const row = await findAccountRow(page, CLARA_EMAIL);
  await expect(row.locator('td').nth(0)).toHaveText('Clara Dupont');
});
