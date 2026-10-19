import { LitElement, html } from 'lit';
import { deleteBookModalBksStyles } from './delete-book-modal-bks-styles.js';
import { deleteBook } from '../../../api/book.js';
import '../../../components/modal-bks/modal-bks.js';
import '../../../components/button-bks/button-bks.js';

export class DeleteBookModalBks extends LitElement {
  static styles = [deleteBookModalBksStyles];

  static properties = {
    open: { type: Boolean, reflect: true },
    book: { type: Object },
  };

  constructor() {
    super();
    this.open = false;
    this.book = null;
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
          <h2>Delete Book?</h2>
          <p>
            Are you sure you want to delete
            <span class="book-title-highlight">'${this.book?.title}'</span>?
          </p>
          <p>This action cannot be undone.</p>
          <div class="button-container">
            <button-bks
              variant="danger"
              icon="delete"
              label="Delete Book"
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
      await deleteBook(this.book.id);
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
              'This book could not be deleted. Please try again later.',
            activeBorrowings: err.activeBorrowings ?? [],
            activeHolds: err.activeHolds ?? [],
          },
        }),
      );
      return;
    }

    this.dispatchEvent(
      new CustomEvent('book-deleted', { bubbles: true, composed: true }),
    );
  }
}

customElements.define('delete-book-modal-bks', DeleteBookModalBks);
