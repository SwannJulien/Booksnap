import { API_BASE_URL, API_ROUTES } from './api-routes.js';

// Names fixed by Spring Security's CookieCsrfTokenRepository. Changing either one here
// alone means every write answers 403.
const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';
const CSRF_COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`);

// The methods Spring Security exempts from CSRF, and for the same reason: they are the
// ones that are supposed to change nothing. An endpoint that writes on a GET is outside
// this protection — that is a reason not to write such an endpoint.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * Fired once when the server stops recognising the session. The application shell listens
 * for it and takes the user back to the sign-in screen (US-013).
 *
 * A window event rather than the bubbling CustomEvent the components use, because this is
 * raised from a module and not from anywhere in the DOM tree.
 */
export const SESSION_EXPIRED_EVENT = 'booksnap-session-expired';

/**
 * Fired when the server refuses a request the session is not allowed to make. Carries no
 * detail: the shell says the action was refused, and the view stays where it is.
 */
export const ACCESS_DENIED_EVENT = 'booksnap-access-denied';

// The three calls whose refusals belong to their own caller, and which must therefore not
// be turned into a session expiry: /auth/me answering 401 is how a visitor who was never
// signed in is recognised at startup (US-012), a refused sign-in is the message the login
// form itself shows (US-011), and signing out of a session the server has already dropped
// is, from the user's side, a sign-out that worked.
//
// Announcing an expiry for any of them would loop: the redirect leads to the sign-in
// screen, which reads /auth/me again.
//
// Compared as paths, and built through the same base as the requests themselves so that a
// VITE_API_BASE_URL carrying a path prefix is folded into both sides: matching the bare
// route against a prefixed request would silently stop exempting anything, and /auth/me is
// precisely the call whose 401 must not send the visitor to the sign-in screen that reads
// /auth/me.
const SELF_REPORTING_PATHS = new Set(
  [API_ROUTES.ME, API_ROUTES.LOGIN, API_ROUTES.LOGOUT].map(
    route =>
      new URL(`${API_BASE_URL}${route}`, window.location.origin).pathname,
  ),
);

// Shared between concurrent writes so that a page firing several at once asks the server
// for a token once rather than once per call.
let pendingTokenRequest = null;

// Raised by the first 401 and never again until someone signs in. A view loading three
// resources at once gets three 401s, and one expiry: without this, three redirects and
// three messages for a single session that ended once.
let sessionExpiryAnnounced = false;

function readCsrfToken() {
  const match = document.cookie.match(CSRF_COOKIE_PATTERN);
  return match ? decodeURIComponent(match[1]) : null;
}

// Any response would set the cookie; this endpoint exists so a client that needs one has
// something meaningful to call. Required before the very first write of a browser
// session, the login included.
async function requestCsrfToken() {
  pendingTokenRequest ??= fetch(`${API_BASE_URL}${API_ROUTES.CSRF}`, {
    method: 'GET',
    credentials: 'include',
  }).finally(() => {
    pendingTokenRequest = null;
  });

  await pendingTokenRequest;
}

/**
 * Lets a session expiry be announced again, now that a new session has begun.
 *
 * Called when a sign-in succeeds (see auth-state.js). Without it the guard raised by the
 * expiry would still be up, and the *next* session to end in this tab would end silently:
 * failing calls, no message, no redirect.
 */
export function resetSessionExpiryGuard() {
  sessionExpiryAnnounced = false;
}

/**
 * Turns a refused response into the one event the application reacts to.
 *
 * Here rather than in each of the api/ modules on purpose: a 401 means the same thing
 * whichever call received it, and the handling that follows — clear the user, remember the
 * page, go to the sign-in screen — is the same too. Spread over the callers it would be
 * written a dozen times and forgotten on the thirteenth.
 *
 * @param {string} url the request URL, absolute or relative
 * @param {number} status
 */
function announceRefusal(url, status) {
  // URL rather than a string test: API_BASE_URL may carry a scheme and a host, and the
  // path may carry a query string. Both would defeat endsWith().
  const path = new URL(url, window.location.origin).pathname;

  if (SELF_REPORTING_PATHS.has(path)) {
    return;
  }

  // A 403 is not a 401 and must not be treated as one. The session is valid; it is this
  // action that the role does not allow. Signing the user out here would be a lie about
  // what happened, would lose the page they were on, and would hide the real fault —
  // which, on a write, is as likely to be a missing CSRF token as a role.
  if (status === 403) {
    window.dispatchEvent(new CustomEvent(ACCESS_DENIED_EVENT));
    return;
  }

  if (sessionExpiryAnnounced) {
    return;
  }

  sessionExpiryAnnounced = true;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

/**
 * Calls the BookSnap API: sends the session cookie, and the CSRF token on writes.
 *
 * Same signature as fetch and same return: the caller still reads response.ok and
 * response.status, and still throws its own Error with error.status attached. A 401 and a
 * 403 are answered for the whole application on the way through (US-013), and the response
 * is handed back unchanged all the same — the caller is mid-flight and still has its own
 * state to unwind.
 *
 * Use plain fetch for anything that is not our API — a third-party call must not be sent
 * our credentials.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase();

  // Without this the browser attaches no cookie on a cross-origin call, and the request
  // arrives unauthenticated. Harmless when same-origin, so it is set unconditionally.
  const init = { ...options, method, credentials: 'include' };

  if (!SAFE_METHODS.has(method)) {
    let token = readCsrfToken();

    if (!token) {
      await requestCsrfToken();
      token = readCsrfToken();
    }

    // A missing token is not turned into an error here: let the request go and let the
    // server answer 403. Failing early would hide the real cause, which is that the
    // cookie could not be read — a different domain, or HttpOnly set by mistake.
    if (token) {
      init.headers = { ...options.headers, [CSRF_HEADER]: token };
    }
  }

  const response = await fetch(url, init);

  if (response.status === 401 || response.status === 403) {
    announceRefusal(url, response.status);
  }

  return response;
}
