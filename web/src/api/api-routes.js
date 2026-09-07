// Prefix put in front of every API path.
//
// Empty by default, and that is the interesting part: calls then go to the origin
// serving the page. In development that is the Vite dev server, which proxies /api to
// :8080 (see vite.config.js). Everything stays same-origin, which removes CORS, removes
// the SameSite question, and removes the failure where Vite silently picks another port
// because 3000 was taken and the declared origin no longer matches.
//
// VITE_API_BASE_URL overrides it for a deployment where the API sits on another host.
// Doing so puts the API on a different origin than the page: the origin then has to be
// declared in CORS_ALLOWED_ORIGINS on the server, and the two must remain on the same
// registrable domain for the session cookie to be sent at all.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const API_ROUTES = {
  BOOKS: '/api/v1/books',
  BORROWINGS: '/api/v1/borrowings',
  COVERS: '/api/v1/covers',
  COPIES: '/api/v1/copies',
  CSRF: '/api/v1/auth/csrf',
  DEWEY: '/api/v1/dewey',
  GENRES: '/api/v1/genres',
  HOLDS: '/api/v1/holds',
  LOGIN: '/api/v1/auth/login',
  // Handled by Spring Security's logout filter, not by AuthController — the path is the
  // one declared in SecurityConfig, and changing it here alone answers 404.
  LOGOUT: '/api/v1/auth/logout',
  ME: '/api/v1/auth/me',
  PASSWORD: '/api/v1/auth/password',
  USERS: '/api/v1/users',
};
