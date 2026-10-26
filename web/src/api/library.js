import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

export async function getLibraries() {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.LIBRARIES}`);

  if (!response.ok) {
    const error = new Error(`Failed to fetch libraries: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}
