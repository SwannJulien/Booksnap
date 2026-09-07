import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

export async function getCopyStatuses() {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.COPIES}/statuses`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch copy statuses: ${error}`);
  }
}

export async function getBookCopies(bookId) {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.BOOKS}/${bookId}/copies`,
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch books: ${error}`);
  }
}

export async function createCopy(payload) {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.COPIES}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create copy`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

export async function updateCopy(copyId, payload) {
  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.COPIES}/${copyId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (response.status !== 204) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to update copy');
  }
}

export async function deleteCopy(copyId) {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.COPIES}/${copyId}`,
      {
        method: 'DELETE',
      },
    );

    const { status } = response;
    return status;
  } catch (error) {
    throw new Error(`Failed to delete copy: ${error}`);
  }
}

export async function getCopyQrCode(copyId) {
  const response = await apiFetch(
    `${API_BASE_URL}${API_ROUTES.COPIES}/${copyId}/qrcode`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch QR code: ${response.status}`);
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
