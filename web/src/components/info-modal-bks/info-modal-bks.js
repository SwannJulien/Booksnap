import { LitElement, html, nothing } from 'lit';
import { infoModalBksStyles } from './info-modal-bks-styles.js';
import '../modal-bks/modal-bks.js';
import '../button-bks/button-bks.js';

// Deliberately actionless: the user cannot lift the refusal from this screen
export class InfoModalBks extends LitElement {
  static styles = [infoModalBksStyles];

  static properties = {
    open: { type: Boolean, reflect: true },
    heading: { type: String },
    message: { type: String },
  };

  constructor() {
    super();
    this.open = false;
    this.heading = '';
    this.message = '';
  }

  render() {
    return html`
      <modal-bks ?open=${this.open} @modal-close=${this._handleClose}>
        <div class="info-modal-content">
          <div class="info-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
          </div>
          <h2>${this.heading}</h2>
          ${this.message ? html`<p>${this.message}</p>` : nothing}
          <slot></slot>
          <div class="button-container">
            <button-bks
              variant="secondary"
              label="Close"
              @button-click=${this._handleClose}
            ></button-bks>
          </div>
        </div>
      </modal-bks>
    `;
  }

  _handleClose() {
    this.dispatchEvent(
      new CustomEvent('modal-close', { bubbles: true, composed: true }),
    );
  }
}

customElements.define('info-modal-bks', InfoModalBks);
