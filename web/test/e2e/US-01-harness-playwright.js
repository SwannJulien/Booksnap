import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './support/accounts.js';
import { signIn } from './support/sign-in.js';
import { queryE2eDb } from './support/e2e-db.js';

const MARKER_TITLE = 'US-01 fresh database marker';

const userName = page => page.locator('nav span.user-name');

async function currentRole(page) {
  const response = await page.request.get('/api/v1/auth/me');
  expect(response.ok()).toBe(true);
  return (await response.json()).role;
}

async function csrfToken(page) {
  await page.request.get('/api/v1/auth/csrf');
  const cookies = await page.context().cookies();
  return cookies.find(cookie => cookie.name === 'XSRF-TOKEN').value;
}

test('US-01: an administrator signs in and sees their name', async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.admin);

  await expect(userName(page)).toHaveText(ACCOUNTS.admin.fullName);
});

test('US-01: each role has its test account', async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.librarian);
  await expect(userName(page)).toHaveText(ACCOUNTS.librarian.fullName);
  expect(await currentRole(page)).toBe('librarian');

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, ACCOUNTS.user);
  await expect(userName(otherPage)).toHaveText(ACCOUNTS.user.fullName);
  expect(await currentRole(otherPage)).toBe('user');
  await otherContext.close();
});

test('US-01: a run starts from a fresh database', async ({ page }) => {
  const markerCount = await queryE2eDb(
    `SELECT count(*) FROM book WHERE title = '${MARKER_TITLE}'`,
  );
  expect(markerCount).toBe('0');

  await signIn(page, ACCOUNTS.librarian);
  const response = await page.request.post('/api/v1/books', {
    headers: { 'X-XSRF-TOKEN': await csrfToken(page) },
    data: {
      title: MARKER_TITLE,
      isFiction: true,
      genres: [],
      authors: ['US-01 marker author'],
      libraryId: 1,
      sectionName: 'Fiction',
    },
  });

  expect(response.ok()).toBe(true);
});
