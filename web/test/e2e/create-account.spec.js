import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { queryE2eDb } from './support/e2e-db.js';
import {
  copyRow,
  createBook,
  expandBook,
  openSession,
  searchCatalogFor,
} from './support/lifecycle-fixtures.js';
import { signIn } from './support/sign-in.js';

const LEA_EMAIL = 'lea.moreau@example.com';
const PAUL_EMAIL = 'paul.girard@example.com';
const NINA_EMAIL = 'nina.roux@example.com';
const PARENT_EMAIL = 'parent.moreau@example.com';
const CREATED_EMAILS = [LEA_EMAIL, PAUL_EMAIL, NINA_EMAIL];

const REQUIRED = 'This field is required.';
const INVALID_EMAIL = 'Enter a valid email address.';
const EMAIL_TAKEN = 'An account already uses this email.';
const INVALID_CREDENTIALS = 'Email or password is incorrect.';
const STUDENT_FIELDS = ['Key stage', 'House', 'Parent email', 'Sex'];

const LEA = {
  firstName: 'Léa',
  lastName: 'Moreau',
  email: LEA_EMAIL,
  keyStage: 'KS-2',
};
const PAUL = {
  role: 'Librarian',
  firstName: 'Paul',
  lastName: 'Girard',
  email: PAUL_EMAIL,
};

test.afterEach(() => {
  const emails = CREATED_EMAILS.map(email => `'${email}'`).join(', ');
  queryE2eDb(
    `DELETE FROM auth_identity WHERE user_id IN (SELECT id FROM users WHERE email IN (${emails})); DELETE FROM users WHERE email IN (${emails})`,
  );
});

const field = (page, label) => page.getByLabel(label, { exact: true });
// The Users view has its own "Role" filter behind the modal; only the filter offers "All roles".
const roleSelect = page =>
  field(page, 'Role').filter({
    hasNot: page.locator('option', { hasText: 'All roles' }),
  });
const modalHeading = page =>
  page.getByRole('heading', { level: 2, name: 'New account', exact: true });
const newAccountButton = page =>
  page.getByRole('button', { name: 'New account', exact: true });
const createButton = page =>
  page.getByRole('button', { name: 'Create', exact: true });
const searchBox = page =>
  page.getByRole('searchbox', { name: 'Search by name or email' });
const temporaryPasswordOf = page => page.locator('code');

const expectStudentFields = (page, state) =>
  Promise.all(STUDENT_FIELDS.map(label => expect(field(page, label))[state]()));

const totalAccounts = () => Number(queryE2eDb('SELECT count(*) FROM users'));

async function openUsersAsAdmin(page) {
  await signIn(page, ACCOUNTS.admin);
  await page.goto('/users');
}

async function clickNewAccount(page) {
  await newAccountButton(page).click();
  await expect(modalHeading(page)).toBeVisible();
}

async function openNewAccountModal(page) {
  await openUsersAsAdmin(page);
  await clickNewAccount(page);
}

async function fillAccount(page, account) {
  if (account.role) {
    await roleSelect(page).selectOption({ label: account.role });
  }
  if (account.firstName !== undefined) {
    await field(page, 'First name').fill(account.firstName);
  }
  if (account.lastName !== undefined) {
    await field(page, 'Last name').fill(account.lastName);
  }
  if (account.email !== undefined) {
    await field(page, 'Email').fill(account.email);
  }
  if (account.keyStage) {
    await field(page, 'Key stage').selectOption({ label: account.keyStage });
  }
  if (account.house !== undefined) {
    await field(page, 'House').fill(account.house);
  }
  if (account.parentEmail !== undefined) {
    await field(page, 'Parent email').fill(account.parentEmail);
  }
  if (account.sex) {
    await field(page, 'Sex').selectOption({ label: account.sex });
  }
}

async function createAccount(page, account) {
  await fillAccount(page, account);
  await createButton(page).click();
}

async function createStudentAsAdmin(page, account = LEA) {
  await openNewAccountModal(page);
  await createAccount(page, account);
  await expect(modalHeading(page)).toBeHidden();
}

async function createStaffAsAdmin(page, account) {
  await clickNewAccount(page);
  await createAccount(page, account);
  await expect(page.getByText('Account created.')).toBeVisible();
  const password = await temporaryPasswordOf(page).innerText();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(modalHeading(page)).toBeHidden();
  return password.trim();
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

async function signInWith(page, email, password) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function newVisitor(browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const usersLink = page =>
  page.getByRole('link', { name: 'Users', exact: true });
const archiveLink = page =>
  page.getByRole('link', { name: 'Archive', exact: true });

test('US-02: the administrator creates a student', async ({ page }) => {
  await openNewAccountModal(page);
  await expect(roleSelect(page).locator('option:checked')).toHaveText(
    'Student',
  );

  await createAccount(page, {
    ...LEA,
    house: 'Goya',
    parentEmail: PARENT_EMAIL,
    sex: 'Female',
  });

  await expect(modalHeading(page)).toBeHidden();
  const row = await findAccountRow(page, LEA_EMAIL);
  await expect(row.locator('td')).toHaveText([
    'Léa Moreau',
    LEA_EMAIL,
    'Student',
    'Active',
  ]);
});

test('US-02: a created student can borrow right away', async ({
  page,
  browser,
}) => {
  await createStudentAsAdmin(page);
  const { context, page: librarianPage } = await openSession(
    browser,
    ACCOUNTS.librarian,
  );

  try {
    const book = await createBook(librarianPage, 'US-02 Borrow');
    await searchCatalogFor(librarianPage, book.title);
    await expandBook(librarianPage, book.title);
    await copyRow(librarianPage, book.code)
      .getByRole('button', { name: 'More actions' })
      .click();
    await librarianPage.getByRole('menuitem', { name: 'Borrow book' }).click();

    await librarianPage
      .getByRole('button', { name: 'Yes', exact: true })
      .click();
    await librarianPage
      .getByPlaceholder('Search a student...', { exact: true })
      .fill('Moreau');

    await expect(
      librarianPage.getByRole('row').filter({ hasText: LEA_EMAIL }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test('US-02: a created student has no password', async ({ page, browser }) => {
  await createStudentAsAdmin(page);
  const visitor = await newVisitor(browser);

  try {
    await signInWith(visitor.page, LEA_EMAIL, 'any-password-at-all');

    await expect(visitor.page.getByText(INVALID_CREDENTIALS)).toBeVisible();
  } finally {
    await visitor.context.close();
  }
});

test('US-02: the sex is chosen from a closed list', async ({ page }) => {
  await openNewAccountModal(page);

  const options = await field(page, 'Sex').locator('option').allTextContents();
  expect(options.map(option => option.trim())).toEqual([
    '',
    'Female',
    'Male',
    'Other',
  ]);

  await createAccount(page, { ...LEA, sex: 'Other' });
  await expect(modalHeading(page)).toBeHidden();
  expect(
    queryE2eDb(`SELECT genre FROM users WHERE email = '${LEA_EMAIL}'`),
  ).toBe('other');
});

test("US-02: the student's optional fields can stay empty", async ({
  page,
}) => {
  await openNewAccountModal(page);

  await createAccount(page, LEA);

  await expect(modalHeading(page)).toBeHidden();
  expect(
    queryE2eDb(
      `SELECT house IS NULL, parent_email IS NULL, genre IS NULL FROM users WHERE email = '${LEA_EMAIL}'`,
    ),
  ).toBe('t|t|t');
});

test('US-02: the house suggests the houses already in use', async ({
  page,
}) => {
  await openNewAccountModal(page);
  const house = page.getByRole('combobox', { name: 'House', exact: true });

  await house.fill('ve');

  const listbox = page.getByRole('listbox');
  await expect(
    listbox.getByRole('option', { name: 'Velazquez' }),
  ).toBeVisible();
  await expect(listbox.getByRole('option', { name: 'Goya' })).toHaveCount(0);

  await listbox.getByRole('option', { name: 'Velazquez' }).click();

  await expect(house).toHaveValue('Velazquez');
});

test('US-02: a new house is accepted', async ({ page }) => {
  await openNewAccountModal(page);

  await createAccount(page, { ...LEA, house: 'Miró' });

  await expect(modalHeading(page)).toBeHidden();
  expect(
    queryE2eDb(`SELECT house FROM users WHERE email = '${LEA_EMAIL}'`),
  ).toBe('Miró');

  await newAccountButton(page).click();
  await page.getByRole('combobox', { name: 'House', exact: true }).fill('mi');
  await expect(
    page.getByRole('listbox').getByRole('option', { name: 'Miró' }),
  ).toBeVisible();
});

test('US-02: the student fields disappear for a staff member', async ({
  page,
}) => {
  await openNewAccountModal(page);
  await expectStudentFields(page, 'toBeVisible');

  await roleSelect(page).selectOption({ label: 'Librarian' });

  await expectStudentFields(page, 'toBeHidden');

  await roleSelect(page).selectOption({ label: 'Student' });

  await expectStudentFields(page, 'toBeVisible');
});

test('US-02: the administrator creates a librarian and receives their temporary password', async ({
  page,
}) => {
  await openNewAccountModal(page);

  await createAccount(page, PAUL);

  await expect(page.getByText('Account created.')).toBeVisible();
  await expect(page.getByText('Temporary password:')).toBeVisible();
  expect(
    (await temporaryPasswordOf(page).innerText()).trim().length,
  ).toBeGreaterThanOrEqual(12);
  await expect(
    page.getByText(
      'Give it to Paul Girard in person. It will not be shown again.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Copy', exact: true }),
  ).toBeVisible();
  const done = page.getByRole('button', { name: 'Done', exact: true });
  await expect(done).toBeVisible();

  await done.click();

  await expect(page.getByText('Account created.')).toBeHidden();
  const row = await findAccountRow(page, PAUL_EMAIL);
  await expect(row.locator('td').nth(0)).toHaveText('Paul Girard');
  await expect(row.locator('td').nth(2)).toHaveText('Librarian');
  await expect(row.locator('td').nth(3)).toHaveText('Active');
});

test('US-02: the temporary password opens a session with the right role', async ({
  page,
  browser,
}) => {
  await openUsersAsAdmin(page);
  const password = await createStaffAsAdmin(page, PAUL);
  const visitor = await newVisitor(browser);

  try {
    await signInWith(visitor.page, PAUL_EMAIL, password);
    await visitor.page.waitForURL(url => url.pathname !== '/login');

    await expect(archiveLink(visitor.page)).toBeVisible();
    await expect(usersLink(visitor.page)).toHaveCount(0);

    const replacement = 'us02-replacement-password';
    await visitor.page.goto('/account');
    await field(visitor.page, 'Current password').fill(password);
    await field(visitor.page, 'New password').fill(replacement);
    await field(visitor.page, 'Confirm new password').fill(replacement);
    await visitor.page
      .getByRole('button', { name: 'Change password', exact: true })
      .click();

    await expect(visitor.page.getByRole('status')).toContainText(
      'Password changed.',
    );
  } finally {
    await visitor.context.close();
  }
});

test('US-02: a created administrator is an administrator', async ({
  page,
  browser,
}) => {
  await openUsersAsAdmin(page);
  const password = await createStaffAsAdmin(page, {
    role: 'Admin',
    firstName: 'Nina',
    lastName: 'Roux',
    email: NINA_EMAIL,
  });
  const visitor = await newVisitor(browser);

  try {
    await signInWith(visitor.page, NINA_EMAIL, password);

    await expect(usersLink(visitor.page)).toBeVisible();
  } finally {
    await visitor.context.close();
  }
});

test('US-02: "Copy" copies the temporary password', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openNewAccountModal(page);
  await createAccount(page, PAUL);
  await expect(page.getByText('Account created.')).toBeVisible();
  const password = (await temporaryPasswordOf(page).innerText()).trim();

  await page.getByRole('button', { name: 'Copy', exact: true }).click();

  await expect(
    page.getByRole('button', { name: 'Copied', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    password,
  );
});

test('US-02: a created student does not receive a temporary password (browser)', async ({
  page,
}) => {
  await openNewAccountModal(page);
  await fillAccount(page, LEA);
  const created = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === '/api/v1/users' &&
      response.request().method() === 'POST',
  );

  await createButton(page).click();

  const body = await (await created).json();
  expect(body).not.toHaveProperty('temporaryPassword');
  await expect(modalHeading(page)).toBeHidden();
  await expect(page.getByText('Account created.')).toHaveCount(0);
});

test('US-02: an email already in use is refused, whatever the case', async ({
  page,
}) => {
  await openNewAccountModal(page);
  const before = totalAccounts();

  await createAccount(page, { ...LEA, email: 'Clara.Dupont@Example.com' });

  await expect(modalHeading(page)).toBeVisible();
  await expect(field(page, 'Email')).toHaveAccessibleDescription(EMAIL_TAKEN);
  expect(
    queryE2eDb(
      "SELECT count(*) FROM users WHERE email ILIKE 'clara.dupont@example.com'",
    ),
  ).toBe('1');
  expect(totalAccounts()).toBe(before);
});

const MISSING_FIELDS = [
  { role: 'Student', label: 'First name', blank: { firstName: '' } },
  { role: 'Student', label: 'Last name', blank: { lastName: '' } },
  { role: 'Student', label: 'Email', blank: { email: '' } },
  { role: 'Student', label: 'Key stage', blank: { keyStage: null } },
  { role: 'Librarian', label: 'First name', blank: { firstName: '' } },
];

for (const { role, label, blank } of MISSING_FIELDS) {
  test(`US-02: a required field is missing [${role} / ${label}]`, async ({
    page,
  }) => {
    await openNewAccountModal(page);
    const before = totalAccounts();
    const filled = { ...(role === 'Student' ? LEA : PAUL), ...blank };

    await fillAccount(page, { ...filled, role });
    await createButton(page).click();

    await expect(modalHeading(page)).toBeVisible();
    await expect(field(page, label)).toHaveAccessibleDescription(REQUIRED);
    expect(totalAccounts()).toBe(before);
  });
}

test('US-02: a field made only of spaces counts as empty', async ({ page }) => {
  await openNewAccountModal(page);

  await createAccount(page, { ...LEA, lastName: '   ' });

  await expect(field(page, 'Last name')).toHaveAccessibleDescription(REQUIRED);
});

for (const { label, values } of [
  { label: 'Email', values: { email: 'lea.moreau' } },
  { label: 'Email', values: { email: 'a..b@x.com' } },
  { label: 'Email', values: { email: '.a@x.com' } },
  { label: 'Parent email', values: { parentEmail: 'parent@' } },
  { label: 'Parent email', values: { parentEmail: 'a..b@x.com' } },
]) {
  const value = Object.values(values)[0];
  test(`US-02: an invalid address is refused [${label}: ${value}]`, async ({
    page,
  }) => {
    await openNewAccountModal(page);
    const before = totalAccounts();

    await createAccount(page, { ...LEA, ...values });

    await expect(modalHeading(page)).toBeVisible();
    await expect(field(page, label)).toHaveAccessibleDescription(INVALID_EMAIL);
    expect(totalAccounts()).toBe(before);
  });
}

test('US-02: spaces around the fields are removed', async ({ page }) => {
  await openNewAccountModal(page);

  await createAccount(page, {
    ...LEA,
    firstName: '  Léa ',
    email: ` ${LEA_EMAIL} `,
  });

  await expect(modalHeading(page)).toBeHidden();
  expect(
    queryE2eDb(
      `SELECT first_name || '|' || email FROM users WHERE email = '${LEA_EMAIL}'`,
    ),
  ).toBe(`Léa|${LEA_EMAIL}`);
});

test('US-02: abandoning the creation', async ({ page }) => {
  await openNewAccountModal(page);
  const before = totalAccounts();
  await fillAccount(page, { ...LEA, house: 'Goya' });

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await expect(modalHeading(page)).toBeHidden();
  expect(totalAccounts()).toBe(before);
});

test('US-02: closing the modal while the account is being created discards the temporary password', async ({
  page,
}) => {
  let releaseRequest;
  const requestHeld = new Promise(resolve => {
    releaseRequest = resolve;
  });
  const isCreation = response =>
    new URL(response.url()).pathname === '/api/v1/users' &&
    response.request().method() === 'POST';
  await page.route(
    url => url.pathname === '/api/v1/users',
    async (route, request) => {
      if (request.method() !== 'POST') {
        await route.fallback();
        return;
      }
      await requestHeld;
      await route.continue();
    },
  );
  await openNewAccountModal(page);
  await fillAccount(page, PAUL);
  const created = page.waitForResponse(isCreation);

  await createButton(page).click();
  await page.keyboard.press('Escape');
  await expect(modalHeading(page)).toBeHidden();
  releaseRequest();
  const response = await created;
  const { temporaryPassword } = await response.json();
  expect(temporaryPassword).toBeTruthy();
  await page.evaluate(
    () =>
      new Promise(resolve => {
        setTimeout(resolve);
      }),
  );

  await newAccountButton(page).click();

  await expect(modalHeading(page)).toBeVisible();
  await expect(page.getByText('Account created.')).toBeHidden();
  await expect(page.getByText(temporaryPassword)).toHaveCount(0);
});
