import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

// Returns { copyStatus, borrowing | null }, or null when the copy id is unknown.
export async function getBorrowingByCopyId(copyId) {
  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.BORROWINGS}/${copyId}`,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch borrowing: ${response.status}`,
    );
  }

  return response.json();
}

// Lists borrowings active at the present date (status borrowed or overdue).
// status narrows the list: 'borrowed' (on-time) or 'overdue' (late).
export async function getBorrowings({
  page = 1,
  size = 10,
  q = '',
  status = '',
} = {}) {
  const params = new URLSearchParams({ page, size });
  if (q) params.set('q', q);
  if (status) params.set('status', status);

  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.BORROWINGS}?${params}`,
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch borrowings: ${response.status}`,
    );
  }

  return response.json();
}

// Marks a borrowing as returned. The copy status follows on the server: back to
// available, or on_hold when the copy is handed to the next student in the queue.
// Returns { id, copyId, userId, status, returnedOn, copyStatus, promotedHoldId }.
export async function returnBorrowing(borrowingId) {
  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.BORROWINGS}/${borrowingId}/return`,
    { method: 'POST' },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || `Failed to return borrowing: ${response.status}`,
    );
    // 409 means the book was already returned, e.g. by another librarian
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function createBorrowing(copyId, userId) {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.BORROWINGS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ copyId, userId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || `Failed to create borrowing: ${response.status}`,
    );
    // 409 means the copy stopped being available while the loan was being filled in
    error.status = response.status;
    throw error;
  }

  return response.json();
}
