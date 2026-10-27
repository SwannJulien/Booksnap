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

// Places a hold on a copy's book for a user, queued at that copy's library (pending)
// until a copy of the book is returned there and the hold reaches the head of the queue.
export async function createHold(copyId, userId) {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.HOLDS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ copyId, userId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || `Failed to create hold: ${response.status}`,
    );
    // A 409 carries a reason: 'copy_available' or 'duplicate_hold'
    error.status = response.status;
    error.reason = errorData.reason;
    throw error;
  }

  return response.json();
}
