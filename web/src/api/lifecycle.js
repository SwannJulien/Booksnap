import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

async function getPage(path, page) {
  const response = await apiFetch(`${API_BASE_URL}${path}?page=${page}`);

  if (!response.ok) {
    const error = new Error(`Failed to fetch ${path}: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export function getBookHistory(bookId, page = 1) {
  return getPage(`${API_ROUTES.BOOKS}/${bookId}/history`, page);
}

export function getCopyHistory(copyId, page = 1) {
  return getPage(`${API_ROUTES.COPIES}/${copyId}/history`, page);
}

export function getDeletedBooks(page = 1) {
  return getPage(`${API_ROUTES.ARCHIVE}/books`, page);
}

export function getDeletedCopies(page = 1) {
  return getPage(`${API_ROUTES.ARCHIVE}/copies`, page);
}
