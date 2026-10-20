import { LitElement, html, nothing } from 'lit';
import { copyStatusModalBksStyles } from './copy-status-modal-bks-styles.js';
import { getBorrowingByCopyId } from '../../../api/borrowing.js';
import { updateCopy } from '../../../api/copy.js';
import { formatDate } from '../../../utils/dateFormatter.js';
import '../../../components/modal-bks/modal-bks.js';
import '../../../components/button-bks/button-bks.js';
import '../../book/deletion-blockers-bks/deletion-blockers-bks.js';

export class CopyStatusModalBks extends LitElement {
  static styles = [copyStatusModalBksStyles];

  static properties = {
    open: { type: Boolean, reflect: true },
    copy: { type: Object },
    _error: { type: String, state: true },
    _activeBorrowings: { type: Array, state: true },
    _activeHolds: { type: Array, state: true },
    _setAside: { type: Object, state: true },
    _refused: { type: Boolean, state: true },
    _submitting: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.open = false;
    this.copy = null;
    this._resetState();
  }

  updated(changedProperties) {
    if (changedProperties.has('open') && !this.open) {
      this._resetState();
    }
  }

  _resetState() {
    this._error = '';
    this._activeBorrowings = [];
    this._activeHolds = [];
    this._setAside = null;
    this._refused = false;
    this._submitting = false;
  }

  get _isLost() {
    return this.copy?.status?.toLowerCase() === 'lost';
  }

  render() {
    return html`
      <modal-bks ?open=${this.open} @modal-close=${this._handleClose}>
        <div class="status-modal-content">
          ${this._setAside ? this._setAsideTpl : this._confirmTpl}
        </div>
      </modal-bks>
    `;
  }

  get _confirmTpl() {
    return html`
      <h2>
        ${this._isLost
          ? 'This copy is marked as lost'
          : 'Declare this copy lost?'}
      </h2>
      <p>
        ${this._isLost
          ? 'Put it back on the shelf?'
          : 'Students will no longer see it in the catalogue.'}
      </p>
      ${this._errorTpl}
      <div class="button-container">
        ${this._refused
          ? html`<button-bks
              variant="secondary"
              label="Close"
              @button-click=${this._handleClose}
            ></button-bks>`
          : html`<button-bks
                label="Confirm"
                ?disabled=${this._submitting}
                @button-click=${this._handleConfirm}
              ></button-bks>
              <button-bks
                variant="secondary"
                label="Cancel"
                @button-click=${this._handleClose}
              ></button-bks>`}
      </div>
    `;
  }

  get _errorTpl() {
    if (!this._error) return nothing;
    const hasBlockers =
      this._activeBorrowings.length > 0 || this._activeHolds.length > 0;

    return html`
      <p class="status-error" role="alert">${this._error}</p>
      ${hasBlockers
        ? html`<deletion-blockers-bks
            .activeBorrowings=${this._activeBorrowings}
            .activeHolds=${this._activeHolds}
          ></deletion-blockers-bks>`
        : nothing}
    `;
  }

  get _setAsideTpl() {
    const { firstName, lastName, endDate } = this._setAside;

    return html`
      <h2>Copy back on the shelf</h2>
      <p class="set-aside">
        Set aside for ${firstName} ${lastName}, to collect before
        ${formatDate(endDate)}.
      </p>
      <div class="button-container">
        <button-bks
          variant="secondary"
          label="Close"
          @button-click=${this._handleClose}
        ></button-bks>
      </div>
    `;
  }

  _handleClose() {
    this.dispatchEvent(
      new CustomEvent('modal-close', { bubbles: true, composed: true }),
    );
  }

  async _handleConfirm() {
    this._error = '';
    this._activeBorrowings = [];
    this._activeHolds = [];
    this._submitting = true;

    try {
      await updateCopy(this.copy.id, {
        status: this._isLost ? 'available' : 'lost',
      });
    } catch (err) {
      this._error = err.message;
      this._refused = err.status === 409;
      this._activeBorrowings = err.activeBorrowings ?? [];
      this._activeHolds = err.activeHolds ?? [];
      this._submitting = false;
      return;
    }

    this._setAside = await this._readSetAside();
    this._submitting = false;

    this.dispatchEvent(
      new CustomEvent('copy-status-changed', {
        bubbles: true,
        composed: true,
        detail: {
          id: this.copy.id,
          bookId: this.copy.bookId,
          setAside: !!this._setAside,
        },
      }),
    );
  }

  // The PUT answers 204, so whether the freed copy went to a queued student has to be read back
  async _readSetAside() {
    try {
      const result = await getBorrowingByCopyId(this.copy.id);
      return result?.copyStatus === 'on_hold' ? (result.hold ?? null) : null;
    } catch {
      // The status is written; failing to read it back must not look like a failed write
      return null;
    }
  }
}

customElements.define('copy-status-modal-bks', CopyStatusModalBks);
