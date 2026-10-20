import { LitElement, html } from 'lit';
import { copyTableBksStyles } from './copy-table-bks-styles.js';
import { createCopy } from '../../../api/copy.js';
import { formatStatus } from '../../../utils/statusFormatter.js';
import { isAdmin } from '../../../auth-state.js';
import '../../../components/spinner-bks/spinner-bks.js';
import '../../../components/dropdown-bks/dropdown-bks.js';

export class CopyTableBks extends LitElement {
  static styles = [copyTableBksStyles];

  static properties = {
    copies: { type: Array },
    bookId: { type: Number },
    bookTitle: { type: String },
    loading: { type: Boolean },
    error: { type: String },
    openActionMenuId: { state: true },
    _isMobile: { state: true },
  };

  constructor() {
    super();
    this.copies = [];
    this.bookId = null;
    this.bookTitle = '';
    this.loading = false;
    this.error = '';
    this.openActionMenuId = null;
    this._isMobile = false;
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
  }

  _handleMobileChange = event => {
    this._isMobile = event.matches;
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._handleOutsideClick);
    this._mobileQuery = window.matchMedia('(max-width: 56.25rem)');
    this._isMobile = this._mobileQuery.matches;
    this._mobileQuery.addEventListener('change', this._handleMobileChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleOutsideClick);
    this._mobileQuery.removeEventListener('change', this._handleMobileChange);
  }

  render() {
    if (this.loading) {
      return html`<spinner-bks></spinner-bks>`;
    }

    if (this.error) {
      return html`<div class="error-message">Error: ${this.error}</div>`;
    }

    return this._isMobile ? this._cardsTpl : this._tableTpl;
  }

  get _tableTpl() {
    return html`
      <table class="copies-table">
        <thead>
          <tr>
            <th>Section</th>
            <th>Identification code</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.copies?.map(
            copy => html`
              <tr>
                <td>${copy.section.name}</td>
                <td>${copy.section.id}</td>
                <td>${this._renderStatus(copy)}</td>
                <td>${this._renderActionMenu(copy)}</td>
              </tr>
            `,
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4">${this._renderAddCopyButton()}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  get _cardsTpl() {
    return html`
      <div class="copies-panel">
        <div class="copies-panel-head">
          <span class="copies-panel-title">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 -960 960 960"
              fill="currentColor"
            >
              <path
                d="M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"
              />
            </svg>
            Copy Inventory
          </span>
          <span class="copies-legend">
            <span class="legend-item">
              <span class="legend-dot legend-available"></span>Avail
            </span>
            <span class="legend-item">
              <span class="legend-dot legend-out"></span>Out
            </span>
          </span>
        </div>
        <ul class="copy-cards">
          ${this.copies?.map(
            copy => html`
              <li class="copy-card">
                <div class="copy-card-info">
                  <span class="copy-card-code">${copy.section.id}</span>
                  <span class="copy-card-section"
                    >${copy.section.name || '--'}</span
                  >
                </div>
                ${this._renderStatus(copy)} ${this._renderActionMenu(copy)}
              </li>
            `,
          )}
        </ul>
        ${this._renderAddCopyButton()}
      </div>
    `;
  }

  _renderAddCopyButton() {
    return html`
      <button class="add-copy-button" @click=${this._handleAddCopy}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="15px"
          viewBox="0 -960 960 960"
          width="15px"
          fill="currentColor"
        >
          <path
            d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"
          ></path>
        </svg>
        <p>Add new copy</p>
      </button>
    `;
  }

  _renderStatus(copy) {
    return html`
      <div class="status-container">
        <span class="status-badge ${this._getStatusClass(copy.status)}">
          ${formatStatus(copy.status)}
        </span>
        ${copy.status?.toLowerCase() !== 'available' && copy.dueDate
          ? html`<span class="status-due-date">Due ${copy.dueDate}</span>`
          : ''}
      </div>
    `;
  }

  _renderActionMenu(copy) {
    return html`
      <div class="action-menu-wrapper">
        <button
          class="action-btn ${this.openActionMenuId === copy.id
            ? 'active'
            : ''}"
          aria-label="More actions"
          @click=${() => this._handleCopyAction(copy.id)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
            <path
              d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z"
            />
          </svg>
        </button>
        ${this.openActionMenuId === copy.id
          ? html`
              <dropdown-bks
                .options=${this._getDropdownOptions(copy)}
                @dropdown-selected-option=${this._handleDropdownAction}
              ></dropdown-bks>
            `
          : ''}
      </div>
    `;
  }

  _getDropdownOptions(copy) {
    const data = { ...copy, bookId: this.bookId, bookTitle: this.bookTitle };
    
    const bookHasAvailableCopy = this.copies?.some(
      c => c.status?.toLowerCase() === 'available',
    );
    return [
      // Only an available copy can be lent, so the entry is hidden otherwise
      ...(copy.status?.toLowerCase() === 'available'
        ? [
            {
              action: 'borrow-book',
              data,
              path: 'M300-80q-58 0-99-41t-41-99v-520q0-58 41-99t99-41h500v600q-25 0-42.5 17.5T740-220q0 25 17.5 42.5T800-160v80H300Zm-60-267q14-7 29-10t31-3h20v-440h-20q-25 0-42.5 17.5T240-740v393Zm160-13h320v-440H400v440Zm-160 13v-453 453Zm60 187h373q-6-14-9.5-28.5T660-220q0-16 3-31t10-29H300q-26 0-43 17.5T240-220q0 26 17 43t43 17Z',
              label: 'Borrow book',
              class: '',
            },
          ]
        : []),
      ...(copy.status?.toLowerCase() === 'borrowed'
        ? [
            {
              action: 'return-book',
              data,
              path: 'M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z',
              label: 'Return book',
              class: '',
            },
          ]
        : []),
      ...(copy.status?.toLowerCase() === 'on_hold'
        ? [
            {
              action: 'hand-over-hold',
              data,
              path: 'M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Zm190 520 226-226-56-58-170 170-86-84-56 56 142 142Z',
              label: 'Hand over hold',
              class: '',
            },
          ]
        : []),
      ...(!bookHasAvailableCopy
        ? [
            {
              action: 'hold-book',
              data,
              path: 'M200-120v-640q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v640L480-240 200-120Z',
              label: 'Hold a book',
              class: '',
            },
          ]
        : []),
      {
        action: 'print-qr-code',
        data,
        path: 'M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z',
        label: 'Print QR Code',
        class: '',
      },
      {
        action: 'update-status',
        data,
        path: 'M204-318q-22-38-33-78t-11-82q0-134 93-228t227-94h7l-64-64 56-56 160 160-160 160-56-56 64-64h-7q-100 0-170 70.5T240-478q0 26 6 51t18 49l-60 60ZM481-40 321-200l160-160 56 56-64 64h7q100 0 170-70.5T720-482q0-26-6-51t-18-49l60-60q22 38 33 78t11 82q0 134-93 228t-227 94h-7l64 64-56 56Z',
        label: 'Update status',
        class: '',
      },
      {
        action: 'update-section',
        data,
        path: 'M120-40v-880h80v80h560v-80h80v880h-80v-80H200v80h-80Zm80-480h80v-160h240v160h240v-240H200v240Zm0 320h240v-160h240v160h80v-240H200v240Zm160-320h80v-80h-80v80Zm160 320h80v-80h-80v80ZM360-520h80-80Zm160 320h80-80Z',
        label: 'Update section',
        class: '',
      },
      ...(isAdmin()
        ? [
            {
              action: 'delete-copy',
              data,
              path: 'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z',
              label: 'Delete copy',
              class: 'dropdown-item-danger',
            },
          ]
        : []),
    ];
  }

  _handleDropdownAction() {
    this.openActionMenuId = null;
  }

  _getStatusClass(status) {
    const s = status?.toLowerCase();
    if (s === 'available') return 'status-available';
    if (s === 'lost') return 'status-lost';
    return 'status-borrowed';
  }

  _handleCopyAction(copyId) {
    this.openActionMenuId = this.openActionMenuId === copyId ? null : copyId;
  }

  async _handleAddCopy() {
    const lastCopy = this.copies?.[this.copies.length - 1];
    const payload = {
      bookId: this.bookId,
      libraryId: 1,
      ...(lastCopy?.section?.name && { sectionName: lastCopy.section.name }),
      status: 'available',
    };

    try {
      await createCopy(payload);
      this.dispatchEvent(
        new CustomEvent('copy-created', {
          detail: { bookId: this.bookId },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      this.error = error.message;
    }
  }

  _handleOutsideClick(e) {
    if (!this.openActionMenuId) return;
    const path = e.composedPath();
    const clickedOnDropdown = path.some(
      el =>
        el.classList?.contains('action-dropdown') ||
        el.classList?.contains('action-btn'),
    );
    if (!clickedOnDropdown) {
      this.openActionMenuId = null;
    }
  }
}

customElements.define('copy-table-bks', CopyTableBks);
