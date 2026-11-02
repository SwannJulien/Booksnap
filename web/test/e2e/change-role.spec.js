import { test, expect } from '@playwright/test';
import { ACCOUNTS, E2E_PASSWORD } from './support/accounts.js';
import { queryE2eDb } from './support/e2e-db.js';
import {
  createBook,
  csrfToken,
  giveBack,
  openSession,
} from './support/lifecycle-fixtures.js';
import { signIn } from './support/sign-in.js';

const CLARA_EMAIL = ACCOUNTS.user.email;
const BOB_EMAIL = ACCOUNTS.librarian.email;
const ALICE_EMAIL = ACCOUNTS.admin.email;
const DANIEL_EMAIL = 'daniel.smith@example.com';

const INVALID_CREDENTIALS = 'Email or password is incorrect.';
const SESSION_EXPIRED =
  'Your session has expired. Sign in again to carry on where you left off.';
const OWN_ROLE_MESSAGE = 'You cannot change your own role.';

const ids = {};

test.beforeAll(() => {
  const idOf = email =>
    Number(queryE2eDb(`SELECT id FROM users WHERE email = '${email}'`));
  ids.clara = idOf(CLARA_EMAIL);
  ids.bob = idOf(BOB_EMAIL);
  ids.alice = idOf(ALICE_EMAIL);
  ids.daniel = idOf(DANIEL_EMAIL);
});

test.afterEach(() => {
  queryE2eDb(
    `UPDATE users SET role = 'user', key_stage = 'ks_1', house = 'Picasso' WHERE id = ${ids.clara}; UPDATE users SET role = 'librarian', key_stage = 'ks_3' WHERE id = ${ids.bob}; UPDATE users SET role = 'user' WHERE id = ${ids.daniel}; UPDATE users SET role = 'admin' WHERE id = ${ids.alice}`,
  );
});

const modal = page => page.locator('role-modal-bks');
const field = (page, label) => modal(page).getByLabel(label, { exact: true });
const modalHeading = page =>
  page.getByRole('heading', { level: 2, name: 'Change role', exact: true });
const confirmButton = page =>
  modal(page).getByRole('button', { name: 'Change role', exact: true });
const cancelButton = page =>
  modal(page).getByRole('button', { name: 'Cancel', exact: true });
const searchBox = page =>
  page.getByRole('searchbox', { name: 'Search by name or email' });
const archiveLink = page =>
  page.getByRole('link', { name: 'Archive', exact: true });
const usersLink = page =>
  page.getByRole('link', { name: 'Users', exact: true });
const catalogLink = page =>
  page.getByRole('link', { name: 'Catalog', exact: true });

const roleAndKeyStage = id =>
  queryE2eDb(`SELECT role || '|' || key_stage FROM users WHERE id = ${id}`);
const roleOf = id => queryE2eDb(`SELECT role FROM users WHERE id = ${id}`);

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

async function openChangeRoleFor(page, email) {
  const row = await findAccountRow(page, email);
  await row.getByRole('button', { name: 'More actions' }).click();
  await page
    .getByRole('menuitem', { name: 'Change role', exact: true })
    .click();
  await expect(modalHeading(page)).toBeVisible();
}

async function openChangeRoleAsAdmin(page, email) {
  await openUsersAsAdmin(page);
  await openChangeRoleFor(page, email);
}

async function chooseRole(page, label) {
  await field(page, 'Role').selectOption({ label });
}

async function changeRoleThroughTheModal(page, email, label) {
  await openChangeRoleFor(page, email);
  await chooseRole(page, label);
  await confirmButton(page).click();
  await expect(modalHeading(page)).toBeHidden();
}

async function putRole(page, id, data) {
  return page.request.fetch(`/api/v1/users/${id}/role`, {
    method: 'PUT',
    headers: { 'X-XSRF-TOKEN': await csrfToken(page) },
    data,
  });
}

async function setRoleThroughTheApi(page, id, role) {
  const response = await putRole(page, id, { role });
  expect(response.status()).toBe(200);
}

async function postBorrowing(page, copyId) {
  return page.request.fetch('/api/v1/borrowings', {
    method: 'POST',
    headers: { 'X-XSRF-TOKEN': await csrfToken(page) },
    data: { userId: ids.clara, copyId },
  });
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

test('US-04: an administrator promotes a student to librarian', async ({
  page,
}) => {
  await openChangeRoleAsAdmin(page, CLARA_EMAIL);

  await chooseRole(page, 'Librarian');
  await expect(
    modal(page).getByText(
      'Clara Dupont will be signed out and will sign in again as Librarian.',
    ),
  ).toBeVisible();
  await confirmButton(page).click();

  await expect(modalHeading(page)).toBeHidden();
  const row = await findAccountRow(page, CLARA_EMAIL);
  await expect(row.locator('td').nth(2)).toHaveText('Librarian');
});

test('US-04: the promoted account signs in with its new role', async ({
  page,
}) => {
  queryE2eDb(`UPDATE users SET role = 'librarian' WHERE id = ${ids.clara}`);

  await signIn(page, ACCOUNTS.user);

  await expect(archiveLink(page)).toBeVisible();
  const book = await createBook(page, 'US-04 Promoted');
  const response = await postBorrowing(page, book.copyId);
  expect(response.status()).toBe(201);
  await giveBack(page, (await response.json()).id);
});

test('US-04: the confirmation warns that an account without a password cannot sign in', async ({
  page,
}) => {
  await openChangeRoleAsAdmin(page, DANIEL_EMAIL);

  await chooseRole(page, 'Librarian');

  await expect(
    modal(page).getByText(
      'Daniel Smith will be signed out and will sign in again as Librarian.',
    ),
  ).toBeVisible();
  await expect(
    modal(page).getByText(
      'Daniel Smith has no password yet and cannot sign in until one is set.',
    ),
  ).toBeVisible();
});

test('US-04: a promoted account without a password does not receive one', async ({
  page,
  browser,
}) => {
  await signIn(page, ACCOUNTS.admin);
  await setRoleThroughTheApi(page, ids.daniel, 'librarian');

  const context = await browser.newContext();
  try {
    const anonymous = await context.newPage();
    await attemptSignIn(anonymous, DANIEL_EMAIL);
    await expect(anonymous.getByText(INVALID_CREDENTIALS)).toBeVisible();
  } finally {
    await context.close();
  }
});

test('US-04: an open session takes the new role immediately', async ({
  page,
  browser,
}) => {
  const bob = await openSession(browser, ACCOUNTS.librarian);

  try {
    await openUsersAsAdmin(page);
    await changeRoleThroughTheModal(page, BOB_EMAIL, 'Student');

    await expectSessionClosed(bob.page);
    const me = await bob.page.request.get('/api/v1/auth/me');
    expect(me.status()).toBe(401);
  } finally {
    await bob.context.close();
  }
});

test('US-04: a demoted staff member keeps their password', async ({
  page,
  browser,
}) => {
  await signIn(page, ACCOUNTS.admin);
  const book = await createBook(page, 'US-04 Demoted');
  await setRoleThroughTheApi(page, ids.bob, 'user');

  const bob = await openSession(browser, ACCOUNTS.librarian);
  try {
    await expect(catalogLink(bob.page)).toBeVisible();
    await expect(archiveLink(bob.page)).toHaveCount(0);
    const response = await postBorrowing(bob.page, book.copyId);
    expect(response.status()).toBe(403);
  } finally {
    await bob.context.close();
  }
});

test('US-04: demoting an account without a key stage asks for the key stage', async ({
  page,
}) => {
  queryE2eDb(`UPDATE users SET key_stage = NULL WHERE id = ${ids.bob}`);
  await openChangeRoleAsAdmin(page, BOB_EMAIL);

  await chooseRole(page, 'Student');

  await expect(field(page, 'Key stage')).toBeVisible();
  await expect(field(page, 'Key stage')).toHaveValue('');
  await expect(confirmButton(page)).toBeDisabled();
  await field(page, 'Key stage').selectOption({ label: 'KS-3' });
  await confirmButton(page).click();

  await expect(modalHeading(page)).toBeHidden();
  expect(roleAndKeyStage(ids.bob)).toBe('user|ks_3');
});

test('US-04: an account that already has a key stage keeps it without a question', async ({
  page,
}) => {
  queryE2eDb(`UPDATE users SET role = 'librarian' WHERE id = ${ids.clara}`);
  await openChangeRoleAsAdmin(page, CLARA_EMAIL);

  await chooseRole(page, 'Student');

  await expect(field(page, 'Key stage')).toHaveCount(0);
  await confirmButton(page).click();

  await expect(modalHeading(page)).toBeHidden();
  expect(roleAndKeyStage(ids.clara)).toBe('user|ks_1');
});

test('US-04: the key stage is only asked for when becoming a student', async ({
  page,
}) => {
  queryE2eDb(`UPDATE users SET key_stage = NULL WHERE id = ${ids.bob}`);
  await openChangeRoleAsAdmin(page, BOB_EMAIL);

  await chooseRole(page, 'Admin');

  await expect(field(page, 'Key stage')).toHaveCount(0);
});

test('US-04: an administrator appoints a second administrator', async ({
  page,
  browser,
}) => {
  await openUsersAsAdmin(page);
  await changeRoleThroughTheModal(page, BOB_EMAIL, 'Admin');

  const bob = await openSession(browser, ACCOUNTS.librarian);
  try {
    await expect(usersLink(bob.page)).toBeVisible();
  } finally {
    await bob.context.close();
  }
});

test('US-04: the current role is preselected and cannot be confirmed as is', async ({
  page,
}) => {
  await openChangeRoleAsAdmin(page, CLARA_EMAIL);

  await expect(field(page, 'Role').locator('option:checked')).toHaveText(
    'Student',
  );
  await expect(confirmButton(page)).toBeDisabled();
});

test('US-04: abandoning the change', async ({ page }) => {
  await openChangeRoleAsAdmin(page, CLARA_EMAIL);

  await chooseRole(page, 'Admin');
  await cancelButton(page).click();

  await expect(modalHeading(page)).toBeHidden();
  const row = await findAccountRow(page, CLARA_EMAIL);
  await expect(row.locator('td').nth(2)).toHaveText('Student');
  expect(roleOf(ids.clara)).toBe('user');
});

test('US-04: an administrator cannot change their own role', async ({
  page,
}) => {
  await openUsersAsAdmin(page);

  const row = await findAccountRow(page, ALICE_EMAIL);
  await row.getByRole('button', { name: 'More actions' }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Edit', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Change role', exact: true }),
  ).toHaveCount(0);

  const response = await putRole(page, ids.alice, { role: 'librarian' });
  expect(response.status()).toBe(403);
  expect((await response.json()).message).toBe(OWN_ROLE_MESSAGE);
  expect(roleOf(ids.alice)).toBe('admin');
});
