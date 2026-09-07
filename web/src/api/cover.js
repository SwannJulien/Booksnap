import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

const DEFAULT_COVER_TYPE = 'image/jpeg';

/**
 * Fetches the cover image for an ISBN.
 * A book with no cover is not an error: it resolves with a null blob.
 * @param {string} isbn
 * @returns {Promise<{status: number, blob: Blob|null}>}
 */
export async function getCover(isbn) {
  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.COVERS}/${encodeURIComponent(isbn)}`,
    {
      method: 'GET',
    },
  );

  if (response.status === 404) {
    return { status: response.status, blob: null };
  }

  if (!response.ok) {
    const error = new Error(`Failed to fetch cover: ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();

  return { status: response.status, blob };
}

/**
 * Uploads a cover for an ISBN, from either a File/Blob or an external image URL.
 * @param {Blob|string} coverSource
 * @param {string} isbn
 * @returns {Promise<{status: number}>}
 */
export async function uploadCover(coverSource, isbn) {
  let imageBlob;

  if (coverSource instanceof Blob) {
    imageBlob = coverSource;
  } else if (typeof coverSource === 'string') {
    // It's an external URL (OpenLibrary), fetch the bytes before uploading them
    const imageResponse = await fetch(coverSource);
    if (!imageResponse.ok) {
      const error = new Error(
        `Failed to fetch cover image: ${imageResponse.statusText}`,
      );
      error.status = imageResponse.status;
      throw error;
    }
    imageBlob = await imageResponse.blob();
  } else {
    throw new Error('Invalid cover source type');
  }

  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.COVERS}?isbn=${encodeURIComponent(isbn)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': imageBlob.type || DEFAULT_COVER_TYPE,
      },
      body: imageBlob,
    },
  );

  if (!response.ok) {
    const error = new Error(`Failed to upload cover: ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  return { status: response.status };
}
