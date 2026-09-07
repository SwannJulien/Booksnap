import { getCurrentUser } from './api/auth.js';
import { resetSessionExpiryGuard } from './api/http.js';

/**
 * Who is signed in, for the whole application.
 *
 * A module rather than a store from a library, because the project has no state library
 * and does not need one here: the views hold their own state and pass it down, and what is
 * missing is only a single answer everything can read without asking the server again.
 *
 * None of this is a security boundary. It says what the front end believes about the
 * session, so the interface can be built accordingly; the API decides what is actually
 * allowed, and it does so on every request (US-009).
 */

// The account the session names, or null for nobody. Read directly by isAuthenticated()
// and getAuthenticatedUser(), which is what makes them free of any network call.
let authenticatedUser = null;

// The one /auth/me of the page load, kept so that whoever asks second waits for the first
// answer instead of sending a second request.
let sessionLoad = null;

// The page the visitor was trying to open when the guard sent them to sign in.
let requestedDestination = null;

// Whether the sign-in screen that is about to be shown is being shown because a session
// ended on its own, rather than because someone asked to sign in or signed out.
let sessionExpired = false;

/**
 * Reads the session once per page load, and resolves either way.
 *
 * Deliberately never rejects. A 401 is the ordinary answer for someone who is not signed
 * in, and an unreachable server leaves us no better informed — both end in the same place,
 * the sign-in screen, and a rejection here would only leave the caller with no session
 * state at all and nothing it could render.
 *
 * @returns {Promise<import('./api/auth.js').AuthenticatedUser|null>}
 */
export async function loadSession() {
  sessionLoad ??= getCurrentUser()
    .then(user => {
      authenticatedUser = user;
      return user;
    })
    .catch(() => {
      authenticatedUser = null;
      return null;
    });

  return sessionLoad;
}

/**
 * The account the session names, or null. Answers from memory — calling it on every
 * navigation costs nothing.
 *
 * @returns {import('./api/auth.js').AuthenticatedUser|null}
 */
export function getAuthenticatedUser() {
  return authenticatedUser;
}

/**
 * @returns {boolean} whether the front end believes there is a session.
 */
export function isAuthenticated() {
  return authenticatedUser !== null;
}

/**
 * Records the account a successful sign-in returned.
 *
 * The login response already carries the user, so asking /auth/me for it would be a round
 * trip spent on something we hold.
 *
 * @param {import('./api/auth.js').AuthenticatedUser} user
 */
export function setAuthenticatedUser(user) {
  authenticatedUser = user;
  // Kept in step with the variable above: a later loadSession() would otherwise hand back
  // the promise from before the sign-in, which resolved to null.
  sessionLoad = Promise.resolve(user);
  // There is a session again, so the next one to end is a new event and has to be
  // announced like the first.
  resetSessionExpiryGuard();
}

/**
 * Forgets who was signed in — on sign-out, and when the server stops recognising the
 * session.
 *
 * The cookie is the server's to drop; this is the front end's own copy, and it has to go
 * as well or every guard in US-012 keeps waving the user through to views that can only
 * answer 401.
 */
export function clearAuthenticatedUser() {
  authenticatedUser = null;
  // Resolved rather than reset to null: nobody is signed in, that is settled, and a later
  // caller asking the server again would only be told the same thing.
  sessionLoad = Promise.resolve(null);
}

/**
 * Remembers where someone was going before being asked to sign in.
 *
 * @param {string} destination path, with its query string if it had one
 */
export function rememberDestination(destination) {
  requestedDestination = destination;
}

/**
 * Returns the remembered destination and forgets it, so that the next sign-in — a later
 * one, in the same browser tab, after a session expired somewhere else entirely — does not
 * land on a page nobody asked for this time.
 *
 * @returns {string|null}
 */
export function takeRememberedDestination() {
  const destination = requestedDestination;
  requestedDestination = null;
  return destination;
}

/**
 * Records that the session ended by itself, so the sign-in screen can say so.
 *
 * Someone whose session expired mid-task is not someone who chose to sign in: without a
 * word about it, the sign-in screen appearing over their work looks like the application
 * losing what they were doing.
 */
export function rememberSessionExpired() {
  sessionExpired = true;
}

/**
 * Answers whether the sign-in screen is being shown because a session expired, and clears
 * the flag so that the message is shown once and does not reappear on the next visit to
 * the screen.
 *
 * @returns {boolean}
 */
export function takeSessionExpired() {
  const expired = sessionExpired;
  sessionExpired = false;
  return expired;
}
