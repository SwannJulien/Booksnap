import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

// Returns a list of { id, firstName, lastName, email }.
export async function searchUsers(query) {
  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.USERS}/search?q=${encodeURIComponent(query)}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to search users: ${response.status}`);
  }

  return response.json();
}

// Returns a PagedResponse of { id, firstName, lastName, email, role, active }.
// role narrows to 'user', 'librarian' or 'admin'; status is 'active', 'deactivated' or 'all'.
export async function getUsers({
  page = 1,
  size = 10,
  q = '',
  role = '',
  status = 'active',
} = {}) {
  const params = new URLSearchParams({ page, size, status });
  if (q) params.set('q', q);
  if (role) params.set('role', role);

  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.USERS}?${params}`,
  );

  if (!response.ok) {
    const error = new Error(`Failed to fetch users: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}
