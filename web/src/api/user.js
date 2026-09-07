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
