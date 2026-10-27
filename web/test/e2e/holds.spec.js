import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { queryE2eDb } from './support/e2e-db.js';
import {
  addCopy,
  borrow,
  copyRow,
  createBook,
  expandBook,
  giveBack,
  searchCatalogFor,
} from './support/lifecycle-fixtures.js';
import { signIn } from './support/sign-in.js';

const NEXT_IN_LINE = 'They are next in line for a returned copy.';
const COPY_AVAILABLE =
  'A copy of this book is available at Preschool: borrow it instead.';
const ALREADY_HELD = 'This student already has an active hold on this book.';

const primaryId = () =>
  queryE2eDb("SELECT id FROM library WHERE name = 'Primary'");

async function createMatilda(page) {
  const book = await createBook(page, 'US-02 Matilda');
  const p2 = await addCopy(page, book.bookId, 'Mystery');
  const r1 = await addCopy(page, book.bookId, 'Poetry', Number(primaryId()));
  return { ...book, p1: { copyId: book.copyId, code: book.code }, p2, r1 };
}

function createStudent(prefix) {
  const firstName = `${prefix}${randomUUID().slice(0, 8)}`;
  const id = queryE2eDb(
    `INSERT INTO users (first_name, last_name, email) VALUES ('${firstName}', 'Holder', '${firstName.toLowerCase()}@example.com') RETURNING id`,
  );
  return { id: Number(id.split('\n')[0]), firstName };
}

function insertPendingHold(book, libraryName, student) {
  queryE2eDb(
    `INSERT INTO hold (book_id, library_id, user_id, status, created_date) VALUES (${book.bookId}, (SELECT id FROM library WHERE name = '${libraryName}'), ${student.id}, 'pending', now() - interval '1 hour')`,
  );
}

async function openCopyMenu(page, copy) {
  await copyRow(page, copy.code)
    .getByRole('button', { name: 'More actions' })
    .click();
}

async function openCatalogCopies(page, book) {
  await searchCatalogFor(page, book.title);
  await expandBook(page, book.title);
}

const holdMenuItem = page =>
  page.getByRole('menuitem', { name: 'Hold a book' });

async function openHoldModal(page, book, copy) {
  await openCatalogCopies(page, book);
  await openCopyMenu(page, copy);
  await holdMenuItem(page).click();
}

async function chooseStudent(page, student) {
  await page.locator('input[name="student-search"]').fill(student.firstName);
  await page.getByRole('row').filter({ hasText: student.firstName }).click();
}

async function confirmHold(page) {
  const response = page.waitForResponse(
    r => r.url().endsWith('/api/v1/holds') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  return response;
}

const holdLibrary = student =>
  queryE2eDb(
    `SELECT l.name FROM hold h JOIN library l ON l.id = h.library_id WHERE h.user_id = ${student.id}`,
  );

test.beforeEach(async ({ page }) => {
  await signIn(page, ACCOUNTS.librarian);
});

test("US-02: the menu offers to hold depending on the row's library", async ({
  page,
}) => {
  const book = await createMatilda(page);
  await borrow(page, book.p1.copyId);
  await borrow(page, book.p2.copyId);

  await openCatalogCopies(page, book);

  await openCopyMenu(page, book.p1);
  await expect(holdMenuItem(page)).toBeVisible();
  await openCopyMenu(page, book.p1);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await openCopyMenu(page, book.r1);
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(holdMenuItem(page)).toHaveCount(0);
});

test('US-02: the menu does not offer to hold when a copy of the library is available', async ({
  page,
}) => {
  const book = await createMatilda(page);
  await borrow(page, book.p1.copyId);
  await borrow(page, book.r1.copyId);

  await openCatalogCopies(page, book);

  await openCopyMenu(page, book.p1);
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(holdMenuItem(page)).toHaveCount(0);
  await openCopyMenu(page, book.p1);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await openCopyMenu(page, book.r1);
  await expect(holdMenuItem(page)).toBeVisible();
});

test("US-02: the modal holds in the row's library", async ({ page }) => {
  const book = await createMatilda(page);
  await borrow(page, book.p1.copyId);
  await borrow(page, book.p2.copyId);
  const alice = createStudent('Alice');

  await openHoldModal(page, book, book.p1);
  await chooseStudent(page, alice);
  await confirmHold(page);

  await expect(page.locator('p.hold-detail')).toHaveText(NEXT_IN_LINE);
  expect(holdLibrary(alice)).toBe('Preschool');
});

test('US-02: the modal flags a copy that became available', async ({
  page,
}) => {
  const book = await createMatilda(page);
  await borrow(page, book.p1.copyId);
  const p2Borrowing = await borrow(page, book.p2.copyId);
  await borrow(page, book.r1.copyId);
  const alice = createStudent('Alice');

  await openHoldModal(page, book, book.p1);
  await giveBack(page, p2Borrowing.id);
  await chooseStudent(page, alice);
  await confirmHold(page);

  await expect(page.locator('p.error')).toHaveText(COPY_AVAILABLE);
});

test("US-02: the position counts the library's queue only", async ({
  page,
}) => {
  const book = await createMatilda(page);
  await borrow(page, book.p1.copyId);
  await borrow(page, book.p2.copyId);
  await borrow(page, book.r1.copyId);
  insertPendingHold(book, 'Primary', createStudent('Bob'));
  const alice = createStudent('Alice');

  await openHoldModal(page, book, book.p1);
  await chooseStudent(page, alice);
  await confirmHold(page);

  await expect(page.locator('p.hold-detail')).toHaveText(NEXT_IN_LINE);
});

test('US-02: a student does not hold the same book twice, even elsewhere', async ({
  page,
}) => {
  const book = await createMatilda(page);
  await borrow(page, book.p1.copyId);
  await borrow(page, book.p2.copyId);
  await borrow(page, book.r1.copyId);
  const alice = createStudent('Alice');
  insertPendingHold(book, 'Primary', alice);

  await openHoldModal(page, book, book.p1);
  await chooseStudent(page, alice);
  const response = await confirmHold(page);

  expect(response.status()).toBe(409);
  await expect(page.locator('p.error')).toHaveText(ALREADY_HELD);
});

test('US-03: the loan modal announces the last pickup day', async ({
  page,
}) => {
  const book = await createBook(page, 'US-03 Matilda');
  const alice = createStudent('Alice');
  queryE2eDb(
    `INSERT INTO hold (book_id, library_id, user_id, copy_id, status, start_date, end_date) VALUES (${book.bookId}, (SELECT id FROM library WHERE name = 'Preschool'), ${alice.id}, ${book.copyId}, 'active', current_date, DATE '2027-03-12')`,
  );

  await openCatalogCopies(page, book);
  await openCopyMenu(page, book);
  await page.getByRole('menuitem', { name: 'Hand over hold' }).click();

  await expect(page.locator('p.pickup-detail')).toHaveText(
    'To be collected by Mar 12, 2027.',
  );
});
