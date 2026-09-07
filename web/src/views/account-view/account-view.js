import { LitElement, html } from 'lit';
import { accountView } from './account-view-styles.js';
import '../../components/button-bks/button-bks.js';
import { changePassword } from '../../api/auth.js';

// Mirrors PasswordPolicy.MINIMUM_LENGTH on the server. The server is the authority — this
// copy exists so the form can say the rule before it is broken, and the response is still
// what decides.
const MINIMUM_PASSWORD_LENGTH = 12;

export class AccountView extends LitElement {
  static styles = [accountView];

  static properties = {
    isSubmitting: { type: Boolean },
    errorMessage: { type: String },
    successMessage: { type: String },
  };

  constructor() {
    super();
    this.isSubmitting = false;
    this.errorMessage = '';
    this.successMessage = '';
  }

  render() {
    return html`
      <div class="header">
        <h1>My account</h1>
        <p>Manage the password you sign in with.</p>
      </div>

      <section class="card">
        <h2 class="card-title">Change password</h2>
        <p class="hint">
          Your new password must be at least ${MINIMUM_PASSWORD_LENGTH}
          characters long, and different from the one you use now. Changing it
          signs you out of every other browser.
        </p>

        <form class="password-form" @submit=${this._handleSubmit}>
          <label for="currentPassword">Current password</label>
          <input
            id="currentPassword"
            type="password"
            name="currentPassword"
            autocomplete="current-password"
            required
          />

          <label for="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            name="newPassword"
            autocomplete="new-password"
            minlength="${MINIMUM_PASSWORD_LENGTH}"
            required
          />

          <label for="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            name="confirmPassword"
            autocomplete="new-password"
            minlength="${MINIMUM_PASSWORD_LENGTH}"
            required
          />

          <button-bks
            type="submit"
            label="${this.isSubmitting ? 'Saving…' : 'Change password'}"
            ?disabled=${this.isSubmitting}
          ></button-bks>
        </form>

        ${this._renderFeedback()}
      </section>
    `;
  }

  _renderFeedback() {
    if (this.errorMessage) {
      return html`<p class="message error" role="alert">
        ${this.errorMessage}
      </p>`;
    }

    if (this.successMessage) {
      return html`<p class="message success" role="status">
        ${this.successMessage}
      </p>`;
    }

    return '';
  }

  async _handleSubmit(event) {
    // Without this the browser navigates and the passwords are re-sent as form fields to
    // a page that expects none.
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const currentPassword = formData.get('currentPassword');
    const newPassword = formData.get('newPassword');
    const confirmPassword = formData.get('confirmPassword');

    this.successMessage = '';

    // Checked here rather than sent along: the confirmation field is there to catch a typo
    // in the new password, and the server has nothing to compare it against.
    if (newPassword !== confirmPassword) {
      this.errorMessage = 'The new password and its confirmation do not match.';
      return;
    }

    this.errorMessage = '';
    this.isSubmitting = true;

    try {
      await changePassword(currentPassword, newPassword);
      // Clears the three fields, so a password is not left sitting in the DOM once it has
      // been changed.
      form.reset();
      this.successMessage =
        'Password changed. Your other browsers have been signed out; this one stays open.';
    } catch (error) {
      this.errorMessage =
        error.status === 409
          ? `${error.message}. Change it where your account is managed.`
          : error.message;
    } finally {
      this.isSubmitting = false;
    }
  }
}

customElements.define('account-view', AccountView);
