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

export async function createLibrary(name) {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.LIBRARIES}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || `Failed to create library: ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function renameLibrary(id, name) {
  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.LIBRARIES}/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || `Failed to rename library: ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}
