import { Router } from '@vaadin/router';
import { LitElement, html } from 'lit';
import { loginView } from './login-view-styles.js';
import '../../components/button-bks/button-bks.js';
import { login } from '../../api/auth.js';
import {
  setAuthenticatedUser,
  takeRememberedDestination,
  takeSessionExpired,
} from '../../auth-state.js';

// Where a sign-in lands when nothing else was asked for — someone who came to /login on
// their own rather than being sent there by the route guard.
const DEFAULT_AFTER_LOGIN_PATH = '/';

// Worded so that the first one says nothing about the account. "Unknown email" and "wrong
// password" have to be the same sentence here, for the same reason the server answers both
// with a single message (US-005): anything that tells them apart turns this form into a
// way of asking whether an address belongs to the school.
const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.';
const UNREACHABLE_SERVER_MESSAGE =
  'Booksnap cannot be reached. Check your connection, then try again.';
const UNEXPECTED_ERROR_MESSAGE =
  'Something went wrong while signing in. Please try again.';

// Shown to someone who did not come here on purpose: they were working, and the session
// went. Worded as an explanation rather than an error, because nothing they did was wrong.
const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Sign in again to carry on where you left off.';

export class LoginView extends LitElement {
  static styles = [loginView];

  static properties = {
    isSubmitting: { type: Boolean },
    errorMessage: { type: String },
    noticeMessage: { type: String },
  };

  constructor() {
    super();
    this.isSubmitting = false;
    this.errorMessage = '';
    // Read once, here, because taking it clears it: a fresh view is built on every
    // navigation to this route, and only the one the expiry sent here should say so.
    this.noticeMessage = takeSessionExpired() ? SESSION_EXPIRED_MESSAGE : '';
  }

  render() {
    return html`
      <section class="card login-card">
        <p class="logo">Booksnap</p>
        <h1 class="card-title">Sign in</h1>
        <p class="hint">Use the email address the library knows you by.</p>

        ${this._renderNotice()}

        <form
          class="login-form"
          @submit=${this._handleSubmit}
          @keydown=${this._handleKeydown}
        >
          <label for="email">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            autocomplete="username"
            required
          />

          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            autocomplete="current-password"
            required
          />

          <button-bks
            type="submit"
            label="${this.isSubmitting ? 'Signing in…' : 'Sign in'}"
            ?disabled=${this.isSubmitting}
          ></button-bks>
        </form>

        ${this._renderError()}
      </section>
    `;
  }

  /**
   * The reason the sign-in screen was reached, above the form rather than under it: it
   * explains what happened before the user starts typing, whereas an error explains what
   * came of what they typed.
   *
   * role="status" and not "alert": nothing has failed, so the announcement waits for a
   * pause instead of interrupting a screen reader mid-sentence.
   */
  _renderNotice() {
    if (!this.noticeMessage) {
      return '';
    }

    return html`<p class="message notice" role="status">
      ${this.noticeMessage}
    </p>`;
  }

  _renderError() {
    if (!this.errorMessage) {
      return '';
    }

    return html`<p class="message error" role="alert">${this.errorMessage}</p>`;
  }

  /**
   * Submits on Enter from either field.
   *
   * Needed because `button-bks` is a form-associated custom element, which the browser
   * does not count as a submit button: the form therefore has none, and implicit
   * submission then only happens on a form with a single field. This one has two, so
   * without this handler Enter does nothing at all.
   */
  _handleKeydown(event) {
    // event.target is retargeted to the host of whatever shadow root the key was pressed
    // in, so this is false for Enter on the button — which submits through its own click.
    const pressedInAField = event.target.tagName === 'INPUT';

    if (event.key !== 'Enter' || !pressedInAField || this.isSubmitting) {
      return;
    }

    event.preventDefault();
    // requestSubmit, not submit: it runs the constraint validation that stops an empty
    // form before any request is made, and it fires the submit event this view listens to.
    event.currentTarget.requestSubmit();
  }

  async _handleSubmit(event) {
    // Without this the browser navigates and re-sends the password as a form field to a
    // page that expects none.
    event.preventDefault();

    // The button is disabled while a sign-in is in flight; the Enter key is not, and a
    // second call would go out with the first still open.
    if (this.isSubmitting) {
      return;
    }

    const formData = new FormData(event.target);
    const email = formData.get('email');
    // Read into a local and never assigned to a property: a reactive `password` would keep
    // the plain text alive in the component for as long as the view is on screen.
    const password = formData.get('password');

    this.errorMessage = '';
    this.isSubmitting = true;

    try {
      const user = await login(email, password);
      // Published before navigating: the guard on the destination route reads this, and it
      // saves the /auth/me the rest of the application would otherwise need for something
      // the sign-in already answered.
      setAuthenticatedUser(user);
      Router.go(takeRememberedDestination() ?? DEFAULT_AFTER_LOGIN_PATH);
    } catch (error) {
      this.errorMessage = LoginView._messageFor(error);
      this._clearPassword();
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * A refused sign-in and an unreachable server are two different problems with two
   * different fixes, and telling the user the wrong one sends them looking in the wrong
   * place. `error.status` is what separates them: the API layer attaches it to every
   * answer it got, and a `fetch` that never got one rejects without it.
   */
  static _messageFor(error) {
    if (error.status === 401) {
      return INVALID_CREDENTIALS_MESSAGE;
    }

    if (error.status === undefined) {
      return UNREACHABLE_SERVER_MESSAGE;
    }

    return UNEXPECTED_ERROR_MESSAGE;
  }

  /**
   * Empties the password field after a failed attempt, and leaves the email alone —
   * retyping the address is the part that was not the user's mistake.
   */
  _clearPassword() {
    const passwordInput = this.shadowRoot.querySelector('#password');

    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }
  }
}

customElements.define('login-view', LoginView);
