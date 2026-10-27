import { LitElement, html } from 'lit';
import { buttonBksStyles } from './button-bks-styles.js';
import { sharedStyles } from '../../shared-styles.js';

export class ButtonBks extends LitElement {
  static styles = [buttonBksStyles, sharedStyles];

  static formAssociated = true;

  static properties = {
    label: { type: String },
    disabled: { type: Boolean },
    type: { type: String },
    icon: { type: String },
    compact: { type: Boolean, reflect: true },
    iconOnly: { type: Boolean, attribute: 'icon-only', reflect: true },
    variant: { type: String, reflect: true },
  };

  constructor() {
    super();
    this.label = 'Button';
    /** @type {'button' | 'submit' | 'reset'} */
    this.type = 'button';
    this.disabled = false;
    this.internals = this.attachInternals();
    this.icon = '';
    this.compact = false;
    this.iconOnly = false;
    /** @type {'primary' | 'secondary' | 'danger'} */
    this.variant = 'primary';
  }

  render() {
    return this.iconOnly ? this._renderIconOnly() : this._renderLabelled();
  }

  _renderLabelled() {
    return html`
      <button
        type=${this.type}
        ?disabled=${this.disabled}
        @click=${this._handleClick}
      >
        <span class=${this.icon ? 'text-align' : ''}>
          ${this._handleIcon()} ${this.label}
        </span>
      </button>
    `;
  }

  // The name comes from `title` alone: no hidden label text (Playwright text
  // filters pierce the shadow DOM and would leak it into the host row) and no
  // `aria-label` (getByLabel('Name') in the create-library tests would match it).
  _renderIconOnly() {
    return html`
      <button
        type=${this.type}
        title=${this.label}
        ?disabled=${this.disabled}
        @click=${this._handleClick}
      >
        <span aria-hidden="true">${this._handleIcon()}</span>
      </button>
    `;
  }

  _handleIcon() {
    const icons = {
      add: html`<svg
        xmlns="http://www.w3.org/2000/svg"
        height="24px"
        viewBox="0 -960 960 960"
        width="24px"
        fill="currentColor"
      >
        <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
      </svg>`,
      delete: html`<svg
        xmlns="http://www.w3.org/2000/svg"
        height="20px"
        viewBox="0 -960 960 960"
        width="20px"
        fill="currentColor"
      >
        <path
          d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
        />
      </svg>`,
      edit: html`<svg
        xmlns="http://www.w3.org/2000/svg"
        height="20px"
        viewBox="0 -960 960 960"
        width="20px"
        fill="currentColor"
      >
        <path
          d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"
        />
      </svg>`,
    };

    return icons[this.icon] || null;
  }

  _handleClick(e) {
    // If this is a submit button, use ElementInternals to submit the form
    if (this.type === 'submit' && this.internals.form) {
      this.internals.form.requestSubmit();
    }

    this.dispatchEvent(
      new CustomEvent('button-click', {
        bubbles: true,
        composed: true,
        detail: { event: e },
      }),
    );
  }
}

customElements.define('button-bks', ButtonBks);
