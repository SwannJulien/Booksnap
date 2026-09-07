import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

export async function getDeweyClasses() {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.DEWEY}/classes`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch Dewey classes: ${error}`);
  }
}

export async function getDeweyDivisions(classCode) {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.DEWEY}/classes/${classCode}/divisions`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch Dewey divisions: ${error}`);
  }
}

export async function getDeweyCategories(divisionCode) {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}${API_ROUTES.DEWEY}/divisions/${divisionCode}/categories`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch Dewey categories: ${error}`);
  }
}
