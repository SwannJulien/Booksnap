import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

// Lists holds that are still going somewhere (pending or active), oldest first.
// status narrows the list: 'pending' (waiting), 'active' (ready for pickup),
// 'expired' or 'fulfilled'.
export async function getHolds({ page = 1, size = 10, q = '', status = '' } = {}) {
  const params = new URLSearchParams({ page, size });
  if (q) params.set('q', q);
  if (status) params.set('status', status);

  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.HOLDS}?${params}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch holds: ${response.status}`,
    );
  }

  return response.json();
}

// Places a hold on a book for a user. The hold is queued (pending) until a copy of the
// book is returned and reaches the head of the queue.
export async function createHold(bookId, userId) {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.HOLDS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId, userId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || `Failed to create hold: ${response.status}`,
    );
    // 409 means this student already has an active hold on this book
    error.status = response.status;
    throw error;
  }

  return response.json();
}
