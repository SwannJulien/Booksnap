import { LitElement, html, nothing } from 'lit';
import { roleModalBksStyles } from './role-modal-bks-styles.js';
import { changeUserRole } from '../../../api/user.js';
import { KEY_STAGES, ROLES } from '../account-options.js';
import '../../../components/modal-bks/modal-bks.js';
import '../../../components/button-bks/button-bks.js';

const CHANGE_ERROR = 'The role could not be changed.';

export class RoleModalBks extends LitElement {
  static styles = roleModalBksStyles;

  static properties = {
    open: { type: Boolean, reflect: true },
    account: { type: Object },
    _role: { type: String, state: true },
    _keyStage: { type: String, state: true },
    _error: { type: String, state: true },
    _submitting: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.open = false;
    this.account = null;
    this._resetState();
  }

  willUpdate(changedProperties) {
    if (!changedProperties.has('open')) return;
    this._resetState();
    if (this.open && this.account) this._role = this.account.role;
  }

  _resetState() {
    this._role = '';
    this._keyStage = '';
    this._error = '';
    this._submitting = false;
    this._attempt = null;
  }

  get _name() {
    const { firstName, lastName, email } = this.account;
    return [firstName, lastName].filter(Boolean).join(' ') || email;
  }

  get _isChange() {
    return this._role !== this.account.role;
  }

  get _asksKeyStage() {
    return (
      this._role === 'user' &&
      this.account.role !== 'user' &&
      !this.account.keyStage
    );
  }

  get _cannotSignIn() {
    return this._isChange && this._role !== 'user' && !this.account.hasPassword;
  }

  get _canSubmit() {
    return (
      !this._submitting &&
      this._isChange &&
      !(this._asksKeyStage && !this._keyStage)
    );
  }

  render() {
    return html`
      <modal-bks ?open=${this.open} @modal-close=${this._handleClose}>
        ${this.account ? this._formTpl : nothing}
      </modal-bks>
    `;
  }

  get _formTpl() {
    const roleLabel = ROLES.find(({ value }) => value === this._role)?.label;

    return html`
      <h2>Change role</h2>
      <form novalidate @submit=${RoleModalBks._preventSubmit}>
        <label for="role-modal-role">Role</label>
        <select
          id="role-modal-role"
          name="role"
          .value=${this._role}
          @change=${this._handleRoleChange}
        >
          ${ROLES.map(
            ({ value, label }) => html`
              <option value=${value} ?selected=${value === this._role}>
                ${label}
              </option>
            `,
          )}
        </select>
        ${this._asksKeyStage ? this._keyStageTpl : nothing}
        ${this._isChange
          ? html`<p class="notice">
              ${this._name} will be signed out and will sign in again as
              ${roleLabel}.
            </p>`
          : nothing}
        ${this._cannotSignIn
          ? html`<p class="notice warning">
              ${this._name} has no password yet and cannot sign in until one is
              set.
            </p>`
          : nothing}
        ${this._error
          ? html`<p class="form-error" role="alert">${this._error}</p>`
          : nothing}

        <div class="button-container">
          <button-bks
            label="Change role"
            ?disabled=${!this._canSubmit}
            @button-click=${this._handleSubmit}
          ></button-bks>
          <button-bks
            variant="secondary"
            label="Cancel"
            @button-click=${this._handleClose}
          ></button-bks>
        </div>
      </form>
    `;
  }

  get _keyStageTpl() {
    return html`
      <label for="role-modal-key-stage">Key stage</label>
      <select
        id="role-modal-key-stage"
        name="keyStage"
        .value=${this._keyStage}
        @change=${this._handleKeyStageChange}
      >
        <option value="" ?selected=${!this._keyStage}></option>
        ${KEY_STAGES.map(
          ({ value, label }) => html`
            <option value=${value} ?selected=${value === this._keyStage}>
              ${label}
            </option>
          `,
        )}
      </select>
    `;
  }

  static _preventSubmit(event) {
    event.preventDefault();
  }

  _handleRoleChange(event) {
    this._role = event.target.value;
  }

  _handleKeyStageChange(event) {
    this._keyStage = event.target.value;
  }

  _handleClose() {
    this.dispatchEvent(
      new CustomEvent('modal-close', { bubbles: true, composed: true }),
    );
  }

  async _handleSubmit() {
    if (!this._canSubmit) return;

    this._error = '';
    this._submitting = true;
    const attempt = {};
    this._attempt = attempt;
    try {
      await changeUserRole(this.account.id, {
        role: this._role,
        keyStage: this._asksKeyStage ? this._keyStage : undefined,
      });
      this.dispatchEvent(
        new CustomEvent('role-changed', { bubbles: true, composed: true }),
      );
      if (this._attempt === attempt) this._handleClose();
    } catch {
      if (this._attempt === attempt) this._error = CHANGE_ERROR;
    } finally {
      if (this._attempt === attempt) this._submitting = false;
    }
  }
}

customElements.define('role-modal-bks', RoleModalBks);
