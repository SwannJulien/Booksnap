import { Router } from '@vaadin/router';
import { LitElement, html } from 'lit';

import { booksnapApp } from './booksnap-app-styles.js';
import {
  clearAuthenticatedUser,
  getAuthenticatedUser,
  isAuthenticated,
  loadSession,
  rememberDestination,
  rememberSessionExpired,
} from './auth-state.js';
import { logout } from './api/auth.js';
import { ACCESS_DENIED_EVENT, SESSION_EXPIRED_EVENT } from './api/http.js';
import './components/spinner-bks/spinner-bks.js';
import './views/home-view/home-view.js';

// The one route that is shown without the navigation around it, and the one that does not
// require a session (US-011, US-012).
const LOGIN_PATH = '/login';
const HOME_PATH = '/';

// Said about the action, not about the person: the session is fine, this one operation is
// not allowed for the role it carries. Nothing more precise can be said here — the shell
// sees a status, not which rule produced it.
const ACCESS_DENIED_MESSAGE =
  'You do not have permission to do that. Ask a librarian or an administrator.';

// Long enough to be read by someone who was looking at the part of the screen that just
// failed, rather than at the top of the window.
const ACCESS_DENIED_DISPLAY_MS = 8000;

class BooksnapApp extends LitElement {
  static styles = [booksnapApp];

  static properties = {
    hideNavigation: {
      type: Boolean,
      reflect: true,
      attribute: 'hide-navigation',
    },
    isSessionLoading: {
      type: Boolean,
      reflect: true,
      attribute: 'session-loading',
    },
    _currentUser: { type: Object, state: true },
    _accessDeniedMessage: { type: String, state: true },
  };

  constructor() {
    super();
    // Who the navigation names. Null until /auth/me has answered, and again after signing
    // out — which is what takes the entry out of the <nav> rather than leaving a name
    // nobody is behind any more.
    this._currentUser = null;
    this._accessDeniedMessage = '';
    // Read from the address bar rather than left false and corrected once the router has
    // resolved: the nav would otherwise be painted and removed again on a page opened
    // straight on /login.
    this.hideNavigation = window.location.pathname === LOGIN_PATH;
    // True until /auth/me has answered. Nothing of the application is shown before then —
    // and above all not the sign-in screen, which appearing for an instant in front of
    // someone who is signed in is the flicker this exists to prevent.
    this.isSessionLoading = true;
  }

  async firstUpdated() {
    // Before the router is configured, not alongside it: a guard deciding while /auth/me
    // was still in flight would send a signed-in user reloading the page to the sign-in
    // screen, and that answer is what the guards below read.
    await loadSession();
    this._currentUser = getAuthenticatedUser();

    const router = new Router(this.shadowRoot.querySelector('main'));

    const firstNavigation = router.setRoutes([
      this._protectedRoute(HOME_PATH, 'home-view'),
      this._protectedRoute(
        '/add',
        'add-book-view',
        () => import('./views/add-book-view/add-book-view.js'),
      ),
      this._protectedRoute(
        '/scan',
        'scan-qrcode-view',
        () => import('./views/scan-qrcode-view/scan-qrcode-view.js'),
      ),
      this._protectedRoute(
        '/catalog',
        'catalog-view',
        () => import('./views/catalog-view/catalog-view.js'),
      ),
      this._protectedRoute(
        '/borrowings',
        'borrowing-view',
        () => import('./views/borrowing-view/borrowing-view.js'),
      ),
      this._protectedRoute(
        '/analytics',
        'analytics-view',
        () => import('./views/analytics-view/analytics-view.js'),
      ),
      this._protectedRoute(
        '/settings',
        'settings-view',
        () => import('./views/settings-view/settings-view.js'),
      ),
      this._protectedRoute(
        '/account',
        'account-view',
        () => import('./views/account-view/account-view.js'),
      ),
      {
        path: LOGIN_PATH,
        component: 'login-view',
        // The one route that does not require a session — which is also what keeps the two
        // redirects from chasing each other: everything else sends a visitor without a
        // session here, and this sends a visitor who has one back out.
        action: async (context, commands) => {
          if (isAuthenticated()) {
            return commands.redirect(HOME_PATH);
          }

          await import('./views/login-view/login-view.js');
          // No nav entry links here, so this marks none — which is the point: leaving the
          // previous one marked would show the wrong page as current on the way back.
          this._setActiveEntry(LOGIN_PATH);
          return undefined;
        },
      },
      {
        // Still last, and still a redirect to a guarded route: an unknown URL lands on the
        // home route, whose guard then decides like any other.
        path: '(.*)',
        redirect: HOME_PATH,
      },
    ]);

    // setRoutes settles once the first view is actually on screen. Dropping the loading
    // state before that would uncover the empty shell — navigation and all — for as long
    // as that view, and any redirect standing in front of it, takes to resolve.
    try {
      await firstNavigation;
    } finally {
      // Cleared even when the first navigation failed: a spinner that never stops is worse
      // than a view that did not load, and the router reports its own failure.
      this.isSessionLoading = false;
    }
  }

  /**
   * Declares a route only a signed-in visitor may reach.
   *
   * One function for what used to be eight copies of the same action — the `TODO` this
   * replaces asked for exactly that, and the guard would otherwise have been added to each
   * of them by hand, which is how the eight became eight in the first place.
   *
   * The view module is imported only after the guard has passed, so a page the visitor may
   * not see is a page whose code is never fetched — and, more to the point, never rendered.
   *
   * @param {string} path
   * @param {string} component tag name the router mounts when the guard passes
   * @param {() => Promise<unknown>} [loadView] dynamic import, omitted for eagerly imported views
   */
  _protectedRoute(path, component, loadView) {
    return {
      path,
      component,
      action: async (context, commands) => {
        if (!isAuthenticated()) {
          // Recorded before the redirect, because once the router is on /login the path
          // that was asked for is gone from both the URL and the context.
          rememberDestination(`${context.pathname}${context.search ?? ''}`);
          return commands.redirect(LOGIN_PATH);
        }

        // Before the import, not after: on a URL opened directly there is no click to have
        // marked the entry already, and waiting for the chunk would leave the navigation
        // pointing at the previous page while the new one loads.
        this._setActiveEntry(path);

        if (loadView) {
          await loadView();
        }

        // Nothing returned: the router then renders `component` on its own.
        return undefined;
      },
    };
  }

  /**
   * Marks the navigation entry linking to `path` as the current one and clears the others.
   * A path no entry links to — the sign-in screen — simply leaves none marked.
   *
   * The entries are queried on each navigation rather than collected once in firstUpdated,
   * so nothing here depends on the `<nav>` never being re-rendered.
   */
  _setActiveEntry(path) {
    this.shadowRoot.querySelectorAll('nav li').forEach(item => {
      item.classList.remove('active');
    });

    this.shadowRoot.querySelectorAll('nav a').forEach(link => {
      if (link.getAttribute('href') === path) {
        link.parentElement.classList.add('active');
      }
    });
  }

  _handleMobileChange = event => {
    if (event.matches) {
      this.shadowRoot?.querySelector('nav')?.classList.remove('close');
    }
  };

  /**
   * Hides the navigation on the sign-in screen, and shows it again everywhere else.
   *
   * Read from the router's own event rather than decided in `_protectedRoute`, because
   * `/login` is the one route that does not go through it and the flag has to come back
   * off on the way out again: one listener covers both directions, whichever route the
   * navigation came from and however it was triggered.
   *
   * What this sets is an attribute the stylesheet acts on — the `<nav>` stays in the
   * document. `display: none` already takes it out of the tab order and out of the
   * accessibility tree, and keeping the element means nothing has to be rebuilt on every
   * trip through the sign-in screen.
   */
  _handleLocationChanged = event => {
    this.hideNavigation = event.detail.location.pathname === LOGIN_PATH;
    // Read again on every navigation instead of being pushed here by whoever changed it.
    // Every change of session in this application is followed by one: a sign-in ends on
    // the destination route, a sign-out and an expiry on the sign-in screen. That makes
    // this the one place the name has to be refreshed, and saves an event the login view
    // would otherwise have to remember to fire.
    this._currentUser = getAuthenticatedUser();
  };

  /**
   * Takes the user back to the sign-in screen when the server stops recognising the
   * session — raised once per expiry by the API layer, however many calls were refused.
   *
   * The order matters: the local user goes first, because the guards of US-012 read it and
   * would otherwise let the redirect straight back through; the destination is kept before
   * the address bar changes; and the reason is recorded so that the sign-in screen says
   * what happened rather than appearing out of nowhere.
   */
  _handleSessionExpired = () => {
    // A 401 arriving after a sign-out — a request that was already in flight — is not an
    // expiry to announce: the user is where they meant to be, and telling them their
    // session ran out would be untrue.
    if (!isAuthenticated()) {
      return;
    }

    clearAuthenticatedUser();
    // Now, rather than on the navigation below, which only lands once the sign-in view has
    // been fetched: until then the navigation is still on screen, naming a user whose
    // session is already known to be gone.
    this._currentUser = null;
    rememberDestination(`${window.location.pathname}${window.location.search}`);
    rememberSessionExpired();
    Router.go(LOGIN_PATH);
  };

  /**
   * Says that the server refused the action, and leaves everything else alone: the user
   * stays signed in and stays on the page, which is the whole difference between this and
   * an expiry.
   */
  _handleAccessDenied = () => {
    this._accessDeniedMessage = ACCESS_DENIED_MESSAGE;
    // Restarted rather than left running, so a second refusal shows its message for the
    // full time instead of inheriting what was left of the first one's.
    window.clearTimeout(this._accessDeniedTimer);
    this._accessDeniedTimer = window.setTimeout(
      this._dismissAccessDenied,
      ACCESS_DENIED_DISPLAY_MS,
    );
  };

  _dismissAccessDenied = () => {
    window.clearTimeout(this._accessDeniedTimer);
    this._accessDeniedTimer = undefined;
    this._accessDeniedMessage = '';
  };

  /**
   * Signs out on purpose: closes the session on the server, then forgets it here.
   *
   * The counter is a shared machine. Someone leaving it has to be able to hand it to a
   * colleague and know that the next borrowing is recorded under the colleague's name, and
   * that is what this is for (US-009).
   */
  _handleSignOut = async () => {
    try {
      await logout();
    } catch {
      // Ignored on purpose. The server refusing — or never answering — must not leave
      // somebody stuck signed in at a shared desk; a session it has already dropped
      // answers 401 here, and that is a sign-out that has in fact happened.
    }

    clearAuthenticatedUser();
    // Same reason as in the expiry above: the name goes with the session, not with the
    // navigation that follows it.
    this._currentUser = null;
    // Going through the router rather than reloading the page, so the guards run: the
    // browser's back button then lands on a route whose guard finds no session and sends
    // it here again, instead of redisplaying the view it was showing before.
    Router.go(LOGIN_PATH);
  };

  connectedCallback() {
    super.connectedCallback();
    this._mobileQuery = window.matchMedia('(max-width: 56.25rem)');
    this._mobileQuery.addEventListener('change', this._handleMobileChange);
    // Registered before firstUpdated creates the router, so the navigation it resolves on
    // load is seen like any other.
    window.addEventListener(
      'vaadin-router-location-changed',
      this._handleLocationChanged,
    );
    // On window, because the API layer raises them from a module and not from anywhere in
    // the DOM: there is no path for them to bubble along.
    window.addEventListener(SESSION_EXPIRED_EVENT, this._handleSessionExpired);
    window.addEventListener(ACCESS_DENIED_EVENT, this._handleAccessDenied);
  }

  disconnectedCallback() {
    this._mobileQuery.removeEventListener('change', this._handleMobileChange);
    window.removeEventListener(
      'vaadin-router-location-changed',
      this._handleLocationChanged,
    );
    window.removeEventListener(
      SESSION_EXPIRED_EVENT,
      this._handleSessionExpired,
    );
    window.removeEventListener(ACCESS_DENIED_EVENT, this._handleAccessDenied);
    window.clearTimeout(this._accessDeniedTimer);
    super.disconnectedCallback();
  }

  toggleSidebar() {
    // Toggle class .close if the toggle button is pressed
    this.shadowRoot.querySelector('nav').classList.toggle('close');
  }

  toggleActive(event) {
    const listItems = this.shadowRoot.querySelectorAll('nav li');
    listItems.forEach(item => {
      item.classList.remove('active');
    });
    event.currentTarget.closest('li').classList.add('active');
  }

  /**
   * The refusal message, over the current page rather than inside it.
   *
   * In the shell because the refusal can come from any view and from any call: a message
   * per view would be the same paragraph written nine times, and the views that do not
   * write would still need it for the reads they are not allowed to make.
   */
  _renderAccessDenied() {
    if (!this._accessDeniedMessage) {
      return '';
    }

    return html`
      <p class="access-denied" role="alert">
        <span>${this._accessDeniedMessage}</span>
        <button
          class="dismiss"
          aria-label="Dismiss"
          @click=${this._dismissAccessDenied}
        >
          ×
        </button>
      </p>
    `;
  }

  /**
   * The signed-in user and the way out, at the foot of the navigation.
   *
   * Rendered only when there is one: the sign-in screen hides the <nav> rather than
   * emptying it, and an entry naming nobody would still be in the tab order behind it.
   */
  _renderSession() {
    if (!this._currentUser) {
      return '';
    }

    // Falls back to the email, which no account can be without. The bootstrap
    // administrator is built from environment variables that need not carry a name, so the
    // very first account to sign in to a new deployment is the one most likely to have
    // none — and "null null" in the navigation is how that would show.
    const fullName = [this._currentUser.firstName, this._currentUser.lastName]
      .filter(Boolean)
      .join(' ');

    return html`
      <li class="divider"></li>
      <li class="session">
        <span class="user-name" title=${this._currentUser.email}>
          ${fullName || this._currentUser.email}
        </span>
        <button
          class="sign-out"
          title="Sign out"
          aria-label="Sign out"
          @click=${this._handleSignOut}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 -960 960 960"
          >
            <path
              d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h287L585-622l55-58 200 200-200 200Z"
            />
          </svg>
        </button>
      </li>
    `;
  }

  render() {
    return html`
      ${this.isSessionLoading
        ? html`<div class="session-loading"><spinner-bks></spinner-bks></div>`
        : ''}
      ${this._renderAccessDenied()}
      <nav>
        <ul>
          <li>
            <span class="logo">Booksnap</span>
            <button class="toggle-btn" @click=${this.toggleSidebar}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="24px"
                viewBox="0 -960 960 960"
                width="24px"
                fill="#000000"
              >
                <path
                  d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z"
                />
              </svg>
            </button>
          </li>
          <li>
            <a href="/" @click=${this.toggleActive}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 -960 960 960"
              >
                <path
                  d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z"
                />
              </svg>
              <span>Home</span>
            </a>
          </li>
          <li>
            <a href="/catalog" @click=${this.toggleActive}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 -960 960 960"
              >
                <path
                  d="M80-160v-80h800v80H80Zm80-160v-320h80v320h-80Zm160 0v-480h80v480h-80Zm160 0v-480h80v480h-80Zm280 0L600-600l70-40 160 280-70 40Z"
                />
              </svg>
              <span>Catalog</span>
            </a>
          </li>
          <li>
            <a href="/add" @click=${this.toggleActive}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 -960 960 960"
              >
                <path
                  d="M440-120v-320H120v-80h320v-320h80v320h320v80H520v320h-80Z"
                />
              </svg>
              <span>Add Book</span>
            </a>
          </li>
          <li>
            <a href="/scan" @click=${this.toggleActive}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 -960 960 960"
              >
                <path
                  d="M40-120v-200h80v120h120v80H40Zm680 0v-80h120v-120h80v200H720ZM160-240v-480h80v480h-80Zm120 0v-480h40v480h-40Zm120 0v-480h80v480h-80Zm120 0v-480h120v480H520Zm160 0v-480h40v480h-40Zm80 0v-480h40v480h-40ZM40-640v-200h200v80H120v120H40Zm800 0v-120H720v-80h200v200h-80Z"
                />
              </svg>
              <span>Scan QR Code</span>
            </a>
          </li>
          <li>
            <a href="/borrowings" @click=${this.toggleActive}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 -960 960 960"
              >
                <path
                  d="M280-160 80-360l200-200 56 57-103 103h287v80H233l103 103-56 57Zm400-240-56-57 103-103H440v-80h287L624-743l56-57 200 200-200 200Z"
                />
              </svg>
              <span>Borrowings</span>
            </a>
          </li>
          <li>
            <a href="/analytics" @click=${this.toggleActive}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 -960 960 960"
              >
                <path
                  d="M120-120v-80l80-80v160h-80Zm160 0v-240l80-80v320h-80Zm160 0v-320l80 81v239h-80Zm160 0v-239l80-80v319h-80Zm160 0v-400l80-80v480h-80ZM120-327v-113l280-280 160 160 280-280v113L560-447 400-607 120-327Z"
                />
              </svg>
              <span>Analytics</span>
            </a>
          </li>
          <li class="divider"></li>
          <li>
            <a href="/settings" @click=${this.toggleActive}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 -960 960 960"
                >
                  <path
                    d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"
                  />
                </svg>
                <span>Settings</span>
              </a>
            </li>
            <li>
              <a href="/account" @click=${this.toggleActive}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 -960 960 960"
                >
                  <path
                    d="M234-276q51-39 114-61.5T480-360q69 0 132 22.5T726-276q35-41 54.5-93T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 59 19.5 111t54.5 93Zm246-164q-59 0-99.5-40.5T340-580q0-59 40.5-99.5T480-720q59 0 99.5 40.5T620-580q0 59-40.5 99.5T480-440Zm0 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q53 0 100-15.5t86-44.5q-39-29-86-44.5T480-280q-53 0-100 15.5T294-220q39 29 86 44.5T480-160Zm0-360q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm0-60Zm0 360Z"
                  />
                </svg>
                <span>Account</span>
              </a>
            </li>
            ${this._renderSession()}
        </ul>
      </nav>
      <main></main>
    `;
  }
}

customElements.define('booksnap-app', BooksnapApp);
