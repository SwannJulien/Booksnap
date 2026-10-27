import { randomUUID } from 'crypto';
import { expect } from '@playwright/test';
import { queryE2eDb } from './e2e-db.js';
import { signIn } from './sign-in.js';

export function uniqueTitle(prefix) {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

async function csrfToken(page) {
  await page.request.get('/api/v1/auth/csrf');
  const cookies = await page.context().cookies();
  return cookies.find(cookie => cookie.name === 'XSRF-TOKEN').value;
}

async function send(page, method, url, data) {
  const response = await page.request.fetch(url, {
    method,
    headers: { 'X-XSRF-TOKEN': await csrfToken(page) },
    data,
  });
  expect(response.ok(), `${method} ${url} -> ${response.status()}`).toBe(true);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export async function openSession(browser, account) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, account);
  return { context, page };
}

export async function createBook(page, titlePrefix) {
  const title = uniqueTitle(titlePrefix);
  const author = `US-06 Author ${randomUUID().slice(0, 8)}`;
  const created = await send(page, 'POST', '/api/v1/books', {
    title,
    isFiction: true,
    genres: [],
    authors: [author],
    libraryId: 1,
    sectionName: 'Fiction',
  });
  return {
    bookId: created.bookId,
    copyId: created.copyId,
    code: created.identificationCode,
    title,
    author,
  };
}

export async function addCopy(
  page,
  bookId,
  sectionName = 'Mystery',
  libraryId = 1,
) {
  const created = await send(page, 'POST', '/api/v1/copies', {
    bookId,
    libraryId,
    sectionName,
    status: 'available',
  });
  return { copyId: created.copyId, code: created.identificationCode };
}

export async function renameBook(page, book, newTitle) {
  await send(page, 'PUT', `/api/v1/books/${book.bookId}`, {
    title: newTitle,
    isFiction: true,
    genres: [],
    authors: [book.author],
  });
}

export async function deleteBook(page, bookId) {
  await send(page, 'DELETE', `/api/v1/books/${bookId}`);
}

export async function deleteCopy(page, copyId) {
  await send(page, 'DELETE', `/api/v1/copies/${copyId}`);
}

export function clara() {
  const [id, firstName, lastName] = queryE2eDb(
    `SELECT id || '|' || first_name || '|' || last_name FROM users WHERE email = 'clara.dupont@example.com'`,
  ).split('|');
  return { id: Number(id), firstName, lastName };
}

export async function borrow(page, copyId) {
  return send(page, 'POST', '/api/v1/borrowings', {
    userId: clara().id,
    copyId,
  });
}

export async function giveBack(page, borrowingId) {
  await send(page, 'POST', `/api/v1/borrowings/${borrowingId}/return`);
}

export async function borrowAndReturn(page, copyId) {
  const borrowing = await borrow(page, copyId);
  await giveBack(page, borrowing.id);
}

export async function createDeletedBook(page, titlePrefix) {
  const book = await createBook(page, titlePrefix);
  await deleteBook(page, book.bookId);
  return book;
}

export async function createDeletedBooks(page, prefix, count) {
  const titles = [];
  await Array.from({ length: count }).reduce(async (previous, _, index) => {
    await previous;
    const book = await createDeletedBook(
      page,
      `${prefix} ${String(index + 1).padStart(2, '0')}`,
    );
    titles.push(book.title);
  }, Promise.resolve());
  return titles;
}

export async function historyTotal(page, bookId) {
  const history = await send(page, 'GET', `/api/v1/books/${bookId}/history`);
  return history.page.totalElements;
}

export function emptyArchive() {
  queryE2eDb(
    'UPDATE copy SET deleted_at = NULL WHERE deleted_at IS NOT NULL; UPDATE book SET deleted_at = NULL WHERE deleted_at IS NOT NULL;',
  );
}

function sqlValue(value) {
  if (value === undefined || value === null) {
    return 'NULL';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function insertEvent({
  bookId,
  copyId,
  type,
  actor,
  student,
  detail = {},
  occurredAt,
  backfilled = false,
  approximate = false,
}) {
  queryE2eDb(
    `INSERT INTO lifecycle_event (occurred_at, type, actor, book_id, copy_id, student_id, student_first_name, student_last_name, detail, backfilled, approximate_date) VALUES (${occurredAt ? sqlValue(occurredAt) : 'now()'}, ${sqlValue(type)}, ${sqlValue(actor)}, ${sqlValue(bookId)}, ${sqlValue(copyId)}, ${sqlValue(student?.id)}, ${sqlValue(student?.firstName)}, ${sqlValue(student?.lastName)}, ${sqlValue(JSON.stringify(detail))}::jsonb, ${sqlValue(backfilled)}, ${sqlValue(approximate)})`,
  );
}

export function padHistory(bookId, count) {
  queryE2eDb(
    `INSERT INTO lifecycle_event (type, actor, book_id, detail) SELECT 'book_updated', 'padding-' || lpad(n::text, 3, '0') || '@example.com', ${sqlValue(bookId)}, '{"title": "padding", "changes": {"title": {"old": "a", "new": "b"}}}'::jsonb FROM generate_series(1, ${count}) AS n`,
  );
}

export async function searchCatalogFor(page, title) {
  await page.goto('/catalog');
  await page
    .getByPlaceholder('Search by title, author, or ISBN...')
    .fill(title);
}

export function bookRow(page, title) {
  return page.getByRole('row').filter({ hasText: title }).first();
}

export async function openBookHistoryFromCatalog(page, title) {
  await searchCatalogFor(page, title);
  const row = bookRow(page, title);
  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'View history' }).click();
}

export async function expandBook(page, title) {
  await bookRow(page, title)
    .getByRole('button', { name: 'Expand row' })
    .click();
}

export function copyRow(page, code) {
  return page
    .locator('copy-table-bks')
    .getByRole('row')
    .filter({ hasText: code });
}

export async function columnTexts(scope, header) {
  const headers = (await scope.getByRole('columnheader').allTextContents()).map(
    text => text.trim(),
  );
  const index = headers.indexOf(header);
  if (index < 0) {
    return [];
  }
  return scope
    .locator('tbody tr')
    .evaluateAll(
      (rows, i) => rows.map(row => row.children[i]?.textContent.trim() ?? ''),
      index,
    );
}
