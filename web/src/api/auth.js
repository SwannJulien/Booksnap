import { API_BASE_URL, API_ROUTES } from './api-routes.js';
import { apiFetch } from './http.js';

/**
 * @typedef {object} AuthenticatedUser
 * @property {number} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 * @property {string} role
 */

/**
 * Signs a member of staff in, and returns the account the session now names.
 *
 * The session itself travels as a cookie the browser keeps on its own; nothing has to be
 * stored from the returned object for later calls to be authenticated.
 *
 * Two failures the caller has to tell apart, and the difference is what error.status
 * carries: a rejected sign-in throws with status 401, whereas an unreachable server
 * throws the fetch TypeError, which has no status at all. Saying "wrong password" to
 * someone whose network is down sends them looking for the wrong problem.
 *
 * The 401 message is the server's fixed "Invalid email or password", identical for an
 * unknown email and a wrong password (US-005). Callers should not enrich it with anything
 * that would distinguish the two.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<AuthenticatedUser>}
 */
export async function login(email, password) {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.LOGIN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || `Failed to sign in: ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * Ends the current session on the server.
 *
 * Callers should clear whatever they hold about the user even when this throws: a session
 * the server has already dropped answers 401 here, and refusing to sign out locally
 * because of it would leave the user stuck in an interface they can no longer use.
 *
 * @returns {Promise<void>}
 */
export async function logout() {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.LOGOUT}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = new Error(`Failed to sign out: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  // 204, no body to read.
}

/**
 * Reads the account the current session names.
 *
 * Throws with status 401 when there is no session, which is an ordinary answer rather
 * than a fault: it is how a caller finds out that nobody is signed in.
 *
 * @returns {Promise<AuthenticatedUser>}
 */
export async function getCurrentUser() {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.ME}`);

  if (!response.ok) {
    const error = new Error(
      `Failed to read the current user: ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * Replaces the signed-in user's own password.
 *
 * There is no user parameter on purpose: the server acts on the account its session
 * names and ignores anything else. Nothing here goes into the URL either — a query
 * string ends up in the access log, in the browser history, and in the Referer of the
 * next request.
 *
 * Succeeding also signs the user out of their other browsers; this one stays valid.
 *
 * Throws on failure, with error.status attached: 400 when the current password is wrong
 * or the new one breaks a rule (error.message says which), 409 when the account signs in
 * through a provider that owns its password.
 *
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
export async function changePassword(currentPassword, newPassword) {
  const response = await apiFetch(`${API_BASE_URL}${API_ROUTES.PASSWORD}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || `Failed to change password: ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  // 204, no body to read.
}
