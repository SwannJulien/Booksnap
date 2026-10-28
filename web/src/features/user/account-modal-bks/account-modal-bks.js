import { LitElement, html, nothing } from 'lit';
import { accountModalBksStyles } from './account-modal-bks-styles.js';
import { createUser, getHouses } from '../../../api/user.js';
import '../../../components/modal-bks/modal-bks.js';
import '../../../components/button-bks/button-bks.js';

const REQUIRED = 'This field is required.';
const INVALID_EMAIL = 'Enter a valid email address.';
const EMAIL_TAKEN = 'An account already uses this email.';
const GENERIC_ERROR = 'The account could not be created.';

const NAME_MAX_LENGTH = 255;

// The intersection of the `email` domain of the database and the server's @Email: dots
// only between non-empty parts of the local part, which the domain alone would let through.
const EMAIL_PATTERN =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const ROLES = [
  { value: 'user', label: 'Student' },
  { value: 'librarian', label: 'Librarian' },
  { value: 'admin', label: 'Admin' },
];

const KEY_STAGES = [
  { value: 'pre_school', label: 'Pre-school' },
  { value: 'ks_1', label: 'KS-1' },
  { value: 'ks_2', label: 'KS-2' },
  { value: 'ks_3', label: 'KS-3' },
  { value: 'ks_4', label: 'KS-4' },
  { value: 'ks_5', label: 'KS-5' },
];

const SEXES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
];

const EMPTY_FORM = {
  role: 'user',
  firstName: '',
  lastName: '',
  email: '',
  keyStage: '',
  house: '',
  parentEmail: '',
  sex: '',
};

export class AccountModalBks extends LitElement {
  static styles = accountModalBksStyles;

  static properties = {
    open: { type: Boolean, reflect: true },
    _form: { type: Object, state: true },
    _errors: { type: Object, state: true },
    _formError: { type: String, state: true },
    _submitting: { type: Boolean, state: true },
    _houses: { type: Array, state: true },
    _houseOpen: { type: Boolean, state: true },
    _created: { type: Object, state: true },
    _copied: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.open = false;
    this._resetState();
  }

  updated(changedProperties) {
    if (!changedProperties.has('open')) return;
    if (this.open) {
      this._loadHouses();
    } else {
      this._resetState();
    }
  }

  _resetState() {
    this._form = { ...EMPTY_FORM };
    this._errors = {};
    this._formError = '';
    this._submitting = false;
    this._houses = [];
    this._houseOpen = false;
    this._created = null;
    this._copied = false;
    this._attempt = null;
  }

  get _isStudent() {
    return this._form.role === 'user';
  }

  get _houseSuggestions() {
    const typed = this._form.house.trim().toLowerCase();
    if (!typed) return [];
    return this._houses.filter(house => house.toLowerCase().includes(typed));
  }

  render() {
    return html`
      <modal-bks ?open=${this.open} @modal-close=${this._handleClose}>
        ${this._created ? this._passwordTpl : this._formTpl}
      </modal-bks>
    `;
  }

  get _formTpl() {
    return html`
      <h2>New account</h2>
      <form novalidate @submit=${AccountModalBks._preventSubmit}>
        <label for="account-role">Role</label>
        <select
          id="account-role"
          name="role"
          .value=${this._form.role}
          @change=${this._handleInput}
        >
          ${ROLES.map(
            ({ value, label }) =>
              html`<option value=${value}>${label}</option>`,
          )}
        </select>

        ${this._textField(
          'firstName',
          'First name',
          'first-name',
          'text',
          NAME_MAX_LENGTH,
        )}
        ${this._textField(
          'lastName',
          'Last name',
          'last-name',
          'text',
          NAME_MAX_LENGTH,
        )}
        ${this._textField('email', 'Email', 'email', 'email')}
        ${this._isStudent ? this._studentFieldsTpl : nothing}
        ${this._formError
          ? html`<p class="form-error" role="alert">${this._formError}</p>`
          : nothing}

        <div class="button-container">
          <button-bks
            label="Create"
            ?disabled=${this._submitting}
            @button-click=${this._handleCreate}
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

  get _studentFieldsTpl() {
    return html`
      <label for="account-key-stage">Key stage</label>
      <select
        id="account-key-stage"
        name="keyStage"
        aria-describedby=${this._errors.keyStage
          ? 'account-key-stage-error'
          : nothing}
        .value=${this._form.keyStage}
        @change=${this._handleInput}
      >
        <option value=""></option>
        ${KEY_STAGES.map(
          ({ value, label }) => html`<option value=${value}>${label}</option>`,
        )}
      </select>
      ${AccountModalBks._errorTpl('account-key-stage', this._errors.keyStage)}
      ${this._houseTpl()}
      ${this._textField('parentEmail', 'Parent email', 'parent-email', 'email')}

      <label for="account-sex">Sex</label>
      <select
        id="account-sex"
        name="sex"
        .value=${this._form.sex}
        @change=${this._handleInput}
      >
        <option value=""></option>
        ${SEXES.map(
          ({ value, label }) => html`<option value=${value}>${label}</option>`,
        )}
      </select>
    `;
  }

  _textField(name, label, idSuffix, type = 'text', maxLength = undefined) {
    const id = `account-${idSuffix}`;
    const error = this._errors[name];

    return html`
      <label for=${id}>${label}</label>
      <input
        id=${id}
        name=${name}
        type=${type === 'email' ? 'text' : type}
        inputmode=${type === 'email' ? 'email' : nothing}
        autocomplete="off"
        maxlength=${maxLength ?? nothing}
        aria-describedby=${error ? `${id}-error` : nothing}
        .value=${this._form[name]}
        @input=${this._handleInput}
      />
      ${AccountModalBks._errorTpl(id, error)}
    `;
  }

  static _errorTpl(id, message) {
    return message
      ? html`<p class="field-error" id="${id}-error">${message}</p>`
      : nothing;
  }

  _houseTpl() {
    const suggestions = this._houseSuggestions;
    const expanded = this._houseOpen && suggestions.length > 0;

    return html`
      <label for="account-house">House</label>
      <div class="house-autocomplete" @focusout=${this._handleHouseFocusOut}>
        <input
          id="account-house"
          name="house"
          role="combobox"
          aria-label="House"
          aria-controls="account-house-listbox"
          aria-expanded=${expanded ? 'true' : 'false'}
          aria-autocomplete="list"
          autocomplete="off"
          .value=${this._form.house}
          @input=${this._handleHouseInput}
        />
        ${expanded
          ? html`<ul
              id="account-house-listbox"
              role="listbox"
              aria-label="Suggested houses"
            >
              ${suggestions.map(
                house =>
                  html`<li
                    role="option"
                    aria-selected="false"
                    tabindex="0"
                    @click=${() => this._selectHouse(house)}
                    @keydown=${e => {
                      if (e.key === 'Enter') this._selectHouse(house);
                    }}
                  >
                    ${house}
                  </li>`,
              )}
            </ul>`
          : nothing}
      </div>
    `;
  }

  get _passwordTpl() {
    const { firstName, lastName, temporaryPassword } = this._created;

    return html`
      <div class="password-screen">
        <h2>Account created.</h2>
        <p>Temporary password: <code>${temporaryPassword}</code></p>
        <p>
          Give it to ${firstName} ${lastName} in person. It will not be shown
          again.
        </p>
        <div class="button-container">
          <button-bks
            label=${this._copied ? 'Copied' : 'Copy'}
            @button-click=${this._handleCopy}
          ></button-bks>
          <button-bks
            variant="secondary"
            label="Done"
            @button-click=${this._handleClose}
          ></button-bks>
        </div>
      </div>
    `;
  }

  static _preventSubmit(event) {
    event.preventDefault();
  }

  async _loadHouses() {
    try {
      this._houses = await getHouses();
    } catch {
      this._houses = [];
    }
  }

  _handleInput(event) {
    const { name, value } = event.target;
    this._form = { ...this._form, [name]: value };
  }

  _handleHouseInput(event) {
    this._handleInput(event);
    this._houseOpen = true;
  }

  _handleHouseFocusOut(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      this._houseOpen = false;
    }
  }

  _selectHouse(house) {
    this._form = { ...this._form, house };
    this._houseOpen = false;
  }

  _handleClose() {
    this.dispatchEvent(
      new CustomEvent('modal-close', { bubbles: true, composed: true }),
    );
  }

  async _handleCopy() {
    try {
      await navigator.clipboard.writeText(this._created.temporaryPassword);
      this._copied = true;
    } catch {
      this._copied = false;
    }
  }

  _validate() {
    const { firstName, lastName, email, keyStage, parentEmail } = this._form;
    const errors = {};
    if (!firstName.trim()) errors.firstName = REQUIRED;
    if (!lastName.trim()) errors.lastName = REQUIRED;
    if (!email.trim()) errors.email = REQUIRED;
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = INVALID_EMAIL;
    if (this._isStudent) {
      if (!keyStage) errors.keyStage = REQUIRED;
      if (parentEmail.trim() && !EMAIL_PATTERN.test(parentEmail.trim())) {
        errors.parentEmail = INVALID_EMAIL;
      }
    }
    return errors;
  }

  _payload() {
    const form = Object.fromEntries(
      Object.entries(this._form).map(([key, value]) => [key, value.trim()]),
    );
    const payload = {
      role: form.role,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
    };
    if (form.role === 'user') {
      payload.keyStage = form.keyStage;
      ['house', 'parentEmail', 'sex'].forEach(key => {
        if (form[key]) payload[key] = form[key];
      });
    }
    return payload;
  }

  async _handleCreate() {
    this._formError = '';
    this._errors = this._validate();
    if (Object.keys(this._errors).length) return;

    this._submitting = true;
    const attempt = {};
    this._attempt = attempt;
    try {
      const account = await createUser(this._payload());
      this.dispatchEvent(
        new CustomEvent('account-created', { bubbles: true, composed: true }),
      );
      // Closing the modal resets the state: a response arriving afterwards must not bring
      // the temporary password back into a closed (or reopened) modal.
      if (this._attempt !== attempt) return;
      if (account.temporaryPassword) {
        this._created = account;
      } else {
        this._handleClose();
      }
    } catch (error) {
      if (this._attempt !== attempt) return;
      if (error.status === 409) {
        this._errors = { email: EMAIL_TAKEN };
      } else {
        this._formError = GENERIC_ERROR;
      }
    } finally {
      this._submitting = false;
    }
  }
}

customElements.define('account-modal-bks', AccountModalBks);
