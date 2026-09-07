import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

export async function postBook(payload) {
  try {
    const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.BOOKS}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const res = { status: response.status, body: await response.json() };
    return res;
  } catch (error) {
    throw new Error(`Failed to post book data${error}`);
  }
}

export async function getBooks(page = 1, size = 10) {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.BOOKS}?page=${page}&size=${size}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch books: ${error}`);
  }
}

export async function searchBooks(
  query,
  { limit = 10, genres = '', copyStatus = '' } = {},
) {
  try {
    const params = new URLSearchParams();
    params.set('q', query);
    if (genres) params.set('genres', genres);
    if (copyStatus) params.set('copyStatus', copyStatus);
    params.set('limit', limit);

    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.BOOKS}/search?${params}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to search books: ${error}`);
  }
}

export async function deleteBook(bookId) {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.BOOKS}/${bookId}`,
      {
        method: 'DELETE',
      },
    );

    const { status } = response;
    return status;
  } catch (error) {
    throw new Error(`Failed to delete book: ${error}`);
  }
}

export async function updateBook(bookId, payload) {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.BOOKS}/${bookId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.status;
  } catch (error) {
    throw new Error(`Failed to update book: ${error}`);
  }
}
