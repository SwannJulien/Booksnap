import { LitElement, html } from 'lit';
import { deleteCopyModalBksStyles } from './delete-copy-modal-bks-styles.js';
import { deleteCopy } from '../../../api/copy.js';
import '../../../components/modal-bks/modal-bks.js';
import '../../../components/button-bks/button-bks.js';

export class DeleteCopyModalBks extends LitElement {
  static styles = [deleteCopyModalBksStyles];

  static properties = {
    open: { type: Boolean, reflect: true },
    copy: { type: Object },
  };

  constructor() {
    super();
    this.open = false;
    this.copy = null;
  }

  render() {
    return html`
      <modal-bks ?open=${this.open} @modal-close=${this._handleClose}>
        <div class="delete-modal-content">
          <div class="delete-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
          </div>
          <h2>Delete Copy?</h2>
          <p>Are you sure you want to delete this copy?</p>
          <p>This action cannot be undone.</p>
          <p class="delete-warning">
            The copy leaves the catalogue. Nothing is destroyed: its loan
            history is kept.
          </p>
          <div class="button-container">
            <button-bks
              variant="danger"
              icon="delete"
              label="Delete Copy"
              @button-click=${this._handleConfirmDelete}
            ></button-bks>
            <button-bks
              variant="secondary"
              label="Cancel"
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

  async _handleConfirmDelete() {
    try {
      await deleteCopy(this.copy.id);
    } catch (err) {
      // A 403 already raised the shell's banner (ACCESS_DENIED_EVENT)
      if (err.status === 403) {
        this._handleClose();
        return;
      }

      this.dispatchEvent(
        new CustomEvent('delete-refused', {
          bubbles: true,
          composed: true,
          detail: {
            message:
              err.message ||
              'This copy could not be deleted. Please try again later.',
          },
        }),
      );
      return;
    }

    this.dispatchEvent(
      new CustomEvent('copy-deleted', {
        bubbles: true,
        composed: true,
        detail: { bookId: this.copy.bookId },
      }),
    );
  }
}

customElements.define('delete-copy-modal-bks', DeleteCopyModalBks);
