import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { signIn } from './support/sign-in.js';
import {
  addCopy,
  borrow,
  borrowAndReturn,
  bookRow,
  clara,
  columnTexts,
  copyRow,
  createBook,
  createDeletedBook,
  createDeletedBooks,
  deleteBook,
  deleteCopy,
  emptyArchive,
  expandBook,
  historyTotal,
  insertEvent,
  openBookHistoryFromCatalog,
  openSession,
  padHistory,
  renameBook,
  searchCatalogFor,
} from './support/lifecycle-fixtures.js';

test.describe.configure({ mode: 'serial' });

const ACCESS_DENIED_BANNER =
  'You do not have permission to do that. Ask a librarian or an administrator.';
const ARCHIVE_REFUSAL =
  'Only librarians and administrators can see the archive.';
const EVENT_DATE = /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{2}:\d{2}$/;
const HISTORY_COLUMNS = ['Date', 'Event', 'Copy', 'By'];
const HISTORY_FAILURE = 'Could not load the history.';

const userName = page => page.locator('nav span.user-name');
const archiveEntry = page =>
  page.locator('nav li:has(> a[href="/analytics"]) + li > a');
const deletedBooks = page =>
  page.getByRole('region', { name: 'Deleted books' });
const deletedCopies = page =>
  page.getByRole('region', { name: 'Deleted copies' });
const historyDialog = page => page.getByRole('dialog');
const historyModal = page => page.locator('history-modal-bks');
const historyHeading = (page, name) =>
  page.getByRole('heading', { name, exact: true });
const bodyRows = scope => scope.locator('tbody tr');
const alertWith = (page, text) =>
  page.getByRole('alert').filter({ hasText: text });

async function withAdmin(browser, setup) {
  const { context, page } = await openSession(browser, ACCOUNTS.admin);
  try {
    return await setup(page);
  } finally {
    await context.close();
  }
}

async function openArchiveAs(page, account) {
  await signIn(page, account);
  await page.goto('/archive');
}

async function openHistoryOfRow(region, rowText) {
  await region
    .getByRole('row')
    .filter({ hasText: rowText })
    .getByRole('button', { name: 'History' })
    .click();
}

async function eventColumnAt(modal, by, column) {
  const actors = await columnTexts(modal, 'By');
  const values = await columnTexts(modal, column);
  const index = actors.indexOf(by);
  return index < 0 ? null : values[index];
}

async function bookWithHistoryOf(browser, total) {
  return withAdmin(browser, async admin => {
    const book = await createBook(admin, 'US06 long history');
    padHistory(book.bookId, total - (await historyTotal(admin, book.bookId)));
    expect(await historyTotal(admin, book.bookId)).toBe(total);
    return book;
  });
}

async function mockEmptyHistory(page) {
  await page.route('**/api/v1/books/*/history*', route =>
    route.fulfill({
      json: {
        data: [],
        page: { size: 50, page: 1, totalElements: 0, totalPages: 0 },
      },
    }),
  );
}

test('US-06: staff have an Archive entry', async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.admin);
  await expect(userName(page)).toHaveText(ACCOUNTS.admin.fullName);
  await expect(archiveEntry(page)).toHaveText('Archive');
  await expect(archiveEntry(page)).toHaveAttribute('href', '/archive');

  const { context, page: librarianPage } = await openSession(
    browser,
    ACCOUNTS.librarian,
  );
  await expect(userName(librarianPage)).toHaveText(ACCOUNTS.librarian.fullName);
  await expect(archiveEntry(librarianPage)).toHaveText('Archive');
  await expect(archiveEntry(librarianPage)).toHaveAttribute('href', '/archive');
  await context.close();
});

test('US-06: a student does not see it', async ({ page }) => {
  await signIn(page, ACCOUNTS.user);

  await expect(userName(page)).toHaveText(ACCOUNTS.user.fullName);
  await expect(page.locator('nav a[href="/analytics"]')).toBeVisible();
  await expect(page.locator('nav a[href="/archive"]')).toHaveCount(0);
});

test('US-06: a student opening the address is refused', async ({ page }) => {
  await openArchiveAs(page, ACCOUNTS.user);

  await expect(alertWith(page, ACCESS_DENIED_BANNER)).toBeVisible();
  await expect(alertWith(page, ARCHIVE_REFUSAL)).toBeVisible();
  await expect(deletedBooks(page)).toHaveCount(0);
  await expect(deletedCopies(page)).toHaveCount(0);
  await expect(page.getByText('Deleted books')).toHaveCount(0);
  await expect(page.getByText('Deleted copies')).toHaveCount(0);

  await expect(alertWith(page, ACCESS_DENIED_BANNER)).toBeHidden({
    timeout: 15_000,
  });
  await expect(alertWith(page, ARCHIVE_REFUSAL)).toBeVisible();
});

test('US-06: the archive shows both lists', async ({ page, browser }) => {
  emptyArchive();
  const { first, second, living } = await withAdmin(browser, async admin => {
    const firstBook = await createDeletedBook(admin, 'US06 first deleted');
    const secondBook = await createBook(admin, 'US06 second deleted');
    await addCopy(admin, secondBook.bookId);
    await deleteBook(admin, secondBook.bookId);
    const livingBook = await createBook(admin, 'Le Petit Prince');
    await addCopy(admin, livingBook.bookId);
    await deleteCopy(admin, livingBook.copyId);
    return {
      first: firstBook,
      second: secondBook,
      living: livingBook,
    };
  });

  await openArchiveAs(page, ACCOUNTS.librarian);

  const books = deletedBooks(page);
  const copies = deletedCopies(page);
  const columns = scope => names =>
    Promise.all(
      names.map(name =>
        expect(
          scope.getByRole('columnheader', { name, exact: true }),
        ).toBeVisible(),
      ),
    );
  await columns(books)([
    'Title',
    'Deleted on',
    'Deleted by',
    'Copies deleted with it',
  ]);
  await columns(copies)(['Code', 'Book', 'Deleted on', 'Deleted by']);

  await expect(bodyRows(books)).toHaveCount(2);
  expect(await columnTexts(books, 'Title')).toEqual([
    second.title,
    first.title,
  ]);
  expect((await columnTexts(books, 'Deleted on'))[0]).toMatch(EVENT_DATE);
  expect((await columnTexts(books, 'Deleted by'))[0]).toBe(
    ACCOUNTS.admin.email,
  );
  expect((await columnTexts(books, 'Copies deleted with it'))[0]).toBe('2');

  await expect(
    copies.getByRole('row').filter({ hasText: living.title }),
  ).toBeVisible();
  const codes = await columnTexts(copies, 'Code');
  const titles = await columnTexts(copies, 'Book');
  expect(codes[titles.indexOf(living.title)]).toBe(living.code);

  await expect(books.getByRole('button', { name: 'History' })).toHaveCount(2);
  await expect(copies.getByRole('button', { name: 'History' })).toHaveCount(
    await bodyRows(copies).count(),
  );
});

test('US-06: an empty archive says so', async ({ page }) => {
  const empty = size => ({
    data: [],
    page: { size, page: 1, totalElements: 0, totalPages: 0 },
  });
  await page.route('**/api/v1/archive/books*', route =>
    route.fulfill({ json: empty(10) }),
  );
  await page.route('**/api/v1/archive/copies*', route =>
    route.fulfill({ json: empty(10) }),
  );

  await openArchiveAs(page, ACCOUNTS.admin);

  await expect(page.getByText('No deleted books.')).toBeVisible();
  await expect(page.getByText('No deleted copies.')).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
});

test('US-06: the archive is browsed page by page', async ({
  page,
  browser,
}) => {
  emptyArchive();
  const titles = await withAdmin(browser, async admin => {
    const created = await createDeletedBooks(admin, 'US06 paged', 12);
    const living = await createBook(admin, 'US06 living for paging');
    await addCopy(admin, living.bookId);
    await deleteCopy(admin, living.copyId);
    return created;
  });

  await openArchiveAs(page, ACCOUNTS.admin);

  const books = deletedBooks(page);
  const copies = deletedCopies(page);
  await expect(bodyRows(books)).toHaveCount(10);
  await expect(books.getByText('Showing 1 to 10 of 12 results')).toBeVisible();
  await expect(books.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await expect(copies.getByRole('row').nth(1)).toBeVisible();
  const copiesBefore = await copies.innerText();

  await books.getByRole('button', { name: 'Next' }).click();

  await expect(bodyRows(books)).toHaveCount(2);
  await expect(books.getByText('Showing 11 to 12 of 12 results')).toBeVisible();
  expect(await columnTexts(books, 'Title')).toEqual([titles[1], titles[0]]);
  await expect(books.getByRole('button', { name: 'Previous' })).toBeEnabled();
  await expect(books.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(await copies.innerText()).toBe(copiesBefore);
});

test('US-06: a server failure does not leave a blank screen', async ({
  page,
}) => {
  await page.route('**/api/v1/archive/books*', route =>
    route.fulfill({ status: 500, body: '{}' }),
  );
  await page.route('**/api/v1/archive/copies*', route =>
    route.fulfill({ status: 500, body: '{}' }),
  );

  await openArchiveAs(page, ACCOUNTS.admin);

  await expect(alertWith(page, 'Could not load deleted books.')).toBeVisible();
  await expect(alertWith(page, 'Could not load deleted copies.')).toBeVisible();
  await expect(page.locator('spinner-bks')).toHaveCount(0);
});

test("US-06: a deleted book's history opens from the archive", async ({
  page,
  browser,
}) => {
  const book = await withAdmin(browser, async admin => {
    const created = await createBook(admin, 'Le Petit Prince');
    await borrowAndReturn(admin, created.copyId);
    await deleteBook(admin, created.bookId);
    return created;
  });

  await openArchiveAs(page, ACCOUNTS.librarian);
  await openHistoryOfRow(deletedBooks(page), book.title);

  const modal = historyModal(page);
  await expect(
    historyHeading(page, `History of "${book.title}"`),
  ).toBeVisible();
  await expect(modal.getByRole('columnheader')).toHaveText(HISTORY_COLUMNS);
  const milestones = [
    `Book created as "${book.title}"`,
    'Borrowed by Clara Dupont',
    'Returned by Clara Dupont',
    'Book deleted',
  ];
  await expect
    .poll(async () =>
      (await columnTexts(modal, 'Event')).filter(text =>
        milestones.includes(text),
      ),
    )
    .toEqual(milestones);
  for (const date of await columnTexts(modal, 'Date')) {
    expect(date).toMatch(EVENT_DATE);
  }
  for (const actor of await columnTexts(modal, 'By')) {
    expect(actor).toMatch(/\S+@\S+/);
  }
});

test("US-06: a book's history names the copy of each event", async ({
  page,
  browser,
}) => {
  const { book, codes } = await withAdmin(browser, async admin => {
    const created = await createBook(admin, 'US06 three copies');
    const second = await addCopy(admin, created.bookId, 'Mystery');
    const third = await addCopy(admin, created.bookId, 'History');
    await deleteBook(admin, created.bookId);
    return { book: created, codes: [created.code, second.code, third.code] };
  });

  await openArchiveAs(page, ACCOUNTS.admin);
  await openHistoryOfRow(deletedBooks(page), book.title);

  const modal = historyModal(page);
  await expect(
    historyHeading(page, `History of "${book.title}"`),
  ).toBeVisible();
  await expect(bodyRows(modal).first()).toBeVisible();
  const events = await columnTexts(modal, 'Event');
  const copyCells = await columnTexts(modal, 'Copy');
  const copiesOf = label =>
    events.flatMap((event, i) => (event === label ? [copyCells[i]] : []));
  expect(copiesOf('Copy created').sort()).toEqual([...codes].sort());
  expect(copiesOf('Copy deleted').sort()).toEqual([...codes].sort());
  expect(copiesOf(`Book created as "${book.title}"`)).toEqual(['']);
  expect(copiesOf('Book deleted')).toEqual(['']);
});

test('US-06: the history of a copy deleted alone holds only that copy', async ({
  page,
  browser,
}) => {
  const book = await withAdmin(browser, async admin => {
    const created = await createBook(admin, 'Le Petit Prince');
    const second = await addCopy(admin, created.bookId);
    await borrow(admin, second.copyId);
    await deleteCopy(admin, created.copyId);
    return created;
  });

  await openArchiveAs(page, ACCOUNTS.admin);
  await openHistoryOfRow(deletedCopies(page), book.title);

  const modal = historyModal(page);
  await expect(
    historyHeading(page, `History of copy ${book.code} — "${book.title}"`),
  ).toBeVisible();
  await expect(bodyRows(modal).first()).toBeVisible();
  const copyCells = await columnTexts(modal, 'Copy');
  expect(copyCells.length).toBeGreaterThan(0);
  expect(new Set(copyCells)).toEqual(new Set([book.code]));
  const events = await columnTexts(modal, 'Event');
  expect(events.at(-1)).toBe('Copy deleted');
});

const EVENT_LABELS = [
  {
    type: 'book_created',
    detail: { title: 'Le Petit Prince' },
    label: 'Book created as "Le Petit Prince"',
  },
  {
    type: 'book_updated',
    detail: {
      changes: {
        title: { old: 'a', new: 'b' },
        publishing_year: { old: 2000, new: 2001 },
      },
    },
    label: 'Book updated: title, publishing_year',
  },
  { type: 'book_deleted', label: 'Book deleted' },
  { type: 'copy_created', copy: true, label: 'Copy created' },
  {
    type: 'copy_updated',
    copy: true,
    detail: { changes: { section_name: { old: 'a', new: 'b' } } },
    label: 'Copy updated: section_name',
  },
  {
    type: 'copy_status_changed',
    copy: true,
    detail: { from: 'available', to: 'lost' },
    label: 'Status: Available → Lost',
  },
  { type: 'copy_deleted', copy: true, label: 'Copy deleted' },
  {
    type: 'borrowed',
    student: true,
    label: 'Borrowed by Clara Dupont',
  },
  { type: 'overdue', student: true, label: 'Overdue: Clara Dupont' },
  { type: 'returned', student: true, label: 'Returned by Clara Dupont' },
  {
    type: 'hold_placed',
    student: true,
    label: 'Hold placed by Clara Dupont',
  },
  {
    type: 'hold_promoted',
    student: true,
    label: 'Set aside for Clara Dupont',
  },
  {
    type: 'hold_expired',
    student: true,
    label: 'Hold expired: Clara Dupont',
  },
  {
    type: 'hold_fulfilled',
    student: true,
    label: 'Hold collected by Clara Dupont',
  },
];

let outlineBookPromise;

function outlineBook(browser) {
  outlineBookPromise ??= (async () => {
    const student = clara();
    const book = await withAdmin(browser, async admin =>
      createBook(admin, 'US06 labels'),
    );
    for (const row of EVENT_LABELS) {
      insertEvent({
        bookId: book.bookId,
        copyId: row.copy ? book.copyId : undefined,
        type: row.type,
        actor: `outline-${row.type}@example.com`,
        student: row.student ? student : undefined,
        detail: {
          title: 'Le Petit Prince',
          ...(row.copy ? { identification_code: book.code } : undefined),
          ...row.detail,
        },
      });
    }
    return book;
  })();
  return outlineBookPromise;
}

for (const { type, label } of EVENT_LABELS) {
  test(`US-06: each event type has its label (${type})`, async ({
    page,
    browser,
  }) => {
    const book = await outlineBook(browser);

    await signIn(page, ACCOUNTS.admin);
    await openBookHistoryFromCatalog(page, book.title);

    await expect(
      historyHeading(page, `History of "${book.title}"`),
    ).toBeVisible();
    await expect
      .poll(() =>
        eventColumnAt(
          historyModal(page),
          `outline-${type}@example.com`,
          'Event',
        ),
      )
      .toBe(label);
  });
}

test('US-06: an unknown type does not break the list', async ({
  page,
  browser,
}) => {
  const book = await withAdmin(browser, async admin => {
    const created = await createBook(admin, 'US06 unknown type');
    await borrow(admin, created.copyId);
    return created;
  });
  await page.route('**/api/v1/books/*/history*', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.data[Math.floor(body.data.length / 2)].type = 'some_new_type';
    await route.fulfill({ response, json: body });
  });

  await signIn(page, ACCOUNTS.admin);
  await openBookHistoryFromCatalog(page, book.title);

  const modal = historyModal(page);
  await expect(bodyRows(modal)).toHaveCount(3);
  expect(await columnTexts(modal, 'Event')).toEqual([
    `Book created as "${book.title}"`,
    'some_new_type',
    'Borrowed by Clara Dupont',
  ]);
});

test('US-06: an approximate date flags itself', async ({ page, browser }) => {
  const book = await withAdmin(browser, async admin =>
    createBook(admin, 'US06 approximate date'),
  );
  insertEvent({
    bookId: book.bookId,
    copyId: book.copyId,
    type: 'returned',
    actor: 'approx@example.com',
    student: clara(),
    detail: { title: book.title },
    occurredAt: '2023-01-09 12:00',
    backfilled: true,
    approximate: true,
  });

  await signIn(page, ACCOUNTS.admin);
  await openBookHistoryFromCatalog(page, book.title);

  await expect
    .poll(() => eventColumnAt(historyModal(page), 'approx@example.com', 'Date'))
    .toBe('Jan 9, 2023 (approx.)');
});

test('US-06: a long history loads in chunks', async ({ page, browser }) => {
  const book = await bookWithHistoryOf(browser, 60);

  await signIn(page, ACCOUNTS.admin);
  await openBookHistoryFromCatalog(page, book.title);

  const modal = historyModal(page);
  const loadMore = modal.getByRole('button', { name: 'Load more' });
  await expect(bodyRows(modal)).toHaveCount(50);
  await expect(loadMore).toBeVisible();
  const firstFifty = await bodyRows(modal).allInnerTexts();

  await loadMore.click();

  await expect(bodyRows(modal)).toHaveCount(60);
  expect((await bodyRows(modal).allInnerTexts()).slice(0, 50)).toEqual(
    firstFifty,
  );
  await expect(loadMore).toHaveCount(0);
});

test('US-06: a short history has no Load more button', async ({
  page,
  browser,
}) => {
  const book = await withAdmin(browser, async admin => {
    const created = await createBook(admin, 'US06 short history');
    await renameBook(admin, created, `${created.title} renamed`);
    expect(await historyTotal(admin, created.bookId)).toBe(3);
    return { ...created, title: `${created.title} renamed` };
  });

  await signIn(page, ACCOUNTS.admin);
  await openBookHistoryFromCatalog(page, book.title);

  const modal = historyModal(page);
  await expect(bodyRows(modal)).toHaveCount(3);
  await expect(modal.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});

test('US-06: a failed Load more keeps what is shown', async ({
  page,
  browser,
}) => {
  const book = await bookWithHistoryOf(browser, 60);
  await page.route(
    url =>
      url.pathname === `/api/v1/books/${book.bookId}/history` &&
      url.searchParams.get('page') === '2',
    route => route.fulfill({ status: 500, body: '{}' }),
  );

  await signIn(page, ACCOUNTS.admin);
  await openBookHistoryFromCatalog(page, book.title);

  const modal = historyModal(page);
  await expect(bodyRows(modal)).toHaveCount(50);
  await modal.getByRole('button', { name: 'Load more' }).click();

  const failure = modal.getByRole('alert').filter({ hasText: HISTORY_FAILURE });
  await expect(failure).toBeVisible();
  await expect(bodyRows(modal)).toHaveCount(50);
  const tableBox = await modal.locator('table').boundingBox();
  const failureBox = await failure.boundingBox();
  expect(failureBox.y).toBeGreaterThanOrEqual(tableBox.y + tableBox.height - 1);
});

test('US-06: a failed history load says so', async ({ page, browser }) => {
  const book = await withAdmin(browser, async admin =>
    createBook(admin, 'US06 failing history'),
  );
  await page.route('**/api/v1/books/*/history*', route =>
    route.fulfill({ status: 500, body: '{}' }),
  );

  await signIn(page, ACCOUNTS.admin);
  await openBookHistoryFromCatalog(page, book.title);

  const modal = historyModal(page);
  await expect(
    modal.getByRole('alert').filter({ hasText: HISTORY_FAILURE }),
  ).toBeVisible();
  await expect(modal.locator('spinner-bks')).toHaveCount(0);
});

test('US-06: an empty history says so', async ({ page, browser }) => {
  const book = await withAdmin(browser, async admin =>
    createBook(admin, 'US06 empty history'),
  );
  await mockEmptyHistory(page);

  await signIn(page, ACCOUNTS.admin);
  await openBookHistoryFromCatalog(page, book.title);

  const modal = historyModal(page);
  await expect(modal.getByText('No events recorded.')).toBeVisible();
  await expect(modal.locator('table')).toHaveCount(0);
});

test('US-06: closing the history leaves the archive where it was', async ({
  page,
  browser,
}) => {
  emptyArchive();
  await withAdmin(browser, async admin => {
    await createDeletedBooks(admin, 'US06 close', 12);
  });

  await openArchiveAs(page, ACCOUNTS.admin);

  const books = deletedBooks(page);
  await books.getByRole('button', { name: 'Next' }).click();
  await expect(books.getByText('Showing 11 to 12 of 12 results')).toBeVisible();
  await bodyRows(books)
    .first()
    .getByRole('button', { name: 'History' })
    .click();
  const dialog = historyDialog(page);
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Close modal' }).click();

  await expect(dialog).toBeHidden();
  await expect(books.getByText('Showing 11 to 12 of 12 results')).toBeVisible();
});

test("US-06: a living book's history opens from the catalog", async ({
  page,
  browser,
}) => {
  const book = await withAdmin(browser, async admin =>
    createBook(admin, 'Le Petit Prince'),
  );

  await signIn(page, ACCOUNTS.librarian);
  await openBookHistoryFromCatalog(page, book.title);

  await expect(
    historyHeading(page, `History of "${book.title}"`),
  ).toBeVisible();
  await expect(bodyRows(historyModal(page)).first()).toContainText(
    `Book created as "${book.title}"`,
  );
});

test("US-06: and a living copy's history", async ({ page, browser }) => {
  const { book, second } = await withAdmin(browser, async admin => {
    const created = await createBook(admin, 'Le Petit Prince');
    const other = await addCopy(admin, created.bookId);
    await borrowAndReturn(admin, created.copyId);
    await borrowAndReturn(admin, other.copyId);
    return { book: created, second: other };
  });

  await signIn(page, ACCOUNTS.admin);
  await searchCatalogFor(page, book.title);
  await expandBook(page, book.title);
  await copyRow(page, book.code)
    .getByRole('button', { name: 'More actions' })
    .click();
  await page.getByRole('menuitem', { name: 'View history' }).click();

  const modal = historyModal(page);
  await expect(
    historyHeading(page, `History of copy ${book.code} — "${book.title}"`),
  ).toBeVisible();
  await expect(bodyRows(modal).first()).toBeVisible();
  const copyCells = await columnTexts(modal, 'Copy');
  expect(copyCells.length).toBeGreaterThan(0);
  expect(copyCells).not.toContain(second.code);
});

test('US-06: a student has no history entry', async ({ page, browser }) => {
  const book = await withAdmin(browser, async admin =>
    createBook(admin, 'US06 student menus'),
  );

  await signIn(page, ACCOUNTS.user);
  await searchCatalogFor(page, book.title);
  const bookMenu = bookRow(page, book.title).getByRole('button', {
    name: 'More actions',
  });
  await bookMenu.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'View history' }),
  ).toHaveCount(0);
  await bookMenu.click();
  await expect(page.getByRole('menu')).toHaveCount(0);

  await expandBook(page, book.title);
  await copyRow(page, book.code)
    .getByRole('button', { name: 'More actions' })
    .click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'View history' }),
  ).toHaveCount(0);
});
