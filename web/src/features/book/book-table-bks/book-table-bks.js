import { LitElement, html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { bookTableBksStyles } from './book-table-bks-styles.js';
import { getBookCopies } from '../../../api/copy.js';
import { formatGenre, formatBookMeta } from '../../../utils/bookFormatter.js';
import { isAdmin } from '../../../auth-state.js';
import '../../../components/dropdown-bks/dropdown-bks.js';
import '../../copy/copy-table-bks/copy-table-bks.js';


function getGenreChipClass(genre) {
  const hash = [...genre].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `genre-chip-${hash % 4}`;
}

function renderGenreChips(book) {
  if (!Array.isArray(book.genres) || !book.genres.length) return '';

  return html`
    <ul class="genre-chips">
      ${book.genres.map(
        genre => html`
          <li class="genre-chip ${getGenreChipClass(genre)}">
            ${formatGenre(genre)}
          </li>
        `,
      )}
    </ul>
  `;
}

export class BookTableBks extends LitElement {
  static styles = [bookTableBksStyles];

  static properties = {
    books: { type: Array },
    coverUrls: { type: Object },
    _bookCopies: { state: true },
    isSearchMode: { type: Boolean },
    searchQuery: { type: String },
    searchGenre: { type: String },
    searchStatus: { type: String },
    searchResultCount: { type: Number },
    pageInfo: { type: Object },
    expandedRows: { state: true },
    openActionMenuId: { state: true },
    _isMobile: { state: true },
  };

  constructor() {
    super();
    this.books = [];
    this.coverUrls = new Map();
    this._bookCopies = new Map();
    this.isSearchMode = false;
    this.searchQuery = '';
    this.searchGenre = '';
    this.searchStatus = '';
    this.searchResultCount = 0;
    this.pageInfo = { page: 1, size: 10, totalElements: 0 };
    this.expandedRows = new Set();
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
    return this._isMobile ? this._cardListTpl : this._tableTpl;
  }

  get _tableTpl() {
    return html`
      <table>
        <thead>
          <tr>
            <th>Book Details</th>
            <th>Author</th>
            <th>Genre</th>
            <th>Year reco.</th>
            <th>Isbn</th>
            <th>Availability</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.books?.map(book => this._renderBookRow(book))}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="7">
              <div class="footer-content">${this._footerContentTpl}</div>
            </td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  get _footerContentTpl() {
    if (this.isSearchMode) {
      return html`<span
        >Found ${this.searchResultCount}
        results${this.searchQuery ? html` for "${this.searchQuery}"` : ''}${this
          .searchGenre
          ? html` for genre "${this.searchGenre}"`
          : ''}${this.searchStatus
          ? html` with status "${this.searchStatus}"`
          : ''}</span
      >`;
    }

    return html`
      <span>${this._getPaginationText()}</span>
      <div class="footer-btn-container">
        <button
          class="btn-previous"
          ?disabled=${this.pageInfo.page === 1}
          @click=${this._handleClickPrevious}
        >
          Previous
        </button>
        <button
          class="btn-next"
          ?disabled=${this.pageInfo.page >=
          Math.ceil(this.pageInfo.totalElements / this.pageInfo.size)}
          @click=${this._handleClickNext}
        >
          Next
        </button>
      </div>
    `;
  }

  get _cardListTpl() {
    return html`
      <div class="card-list">
        ${this.books?.map(book => this._renderBookCard(book))}
        <div class="card-footer">${this._footerContentTpl}</div>
      </div>
    `;
  }

  _renderBookCard(book) {
    const isbn = this._getPrimaryIsbn(book);
    const isExpanded = this.expandedRows.has(book.id);
    const available = book.countCopies?.availableCopies ?? 0;
    const total = book.countCopies?.totalNumberOfCopies ?? 0;

    return html`
      <article class="book-card">
        <div class="card-main">
          ${this._renderCover(isbn)}
          <div class="card-body">
            <h3 class="card-title">${book.title}</h3>
            <p class="card-meta">${formatBookMeta(book)}</p>
            ${renderGenreChips(book)}
            <div
              class="availability-container ${available > 0
                ? 'available'
                : 'unavailable'}"
              style=${styleMap(this._getAvailabilityStyles(book.countCopies))}
            >
              <span class="availability-label"
                >${available > 0 ? 'Available' : 'All out'}</span
              >
              <div class="availability-bar">
                <div class="availability-bar-fill"></div>
              </div>
              <span class="availability-count"
                >${available} of ${total} available</span
              >
            </div>
          </div>
          <div class="card-actions">
            <div class="action-menu-wrapper">
              <button
                class="action-btn menu-btn ${this.openActionMenuId === book.id
                  ? 'active'
                  : ''}"
                aria-label="More actions"
                @click=${e => this._handleActionMenuToggle(e, book.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 -960 960 960"
                >
                  <path
                    d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z"
                  />
                </svg>
              </button>
              ${this.openActionMenuId === book.id
                ? html`
                    <dropdown-bks
                      .options=${this._getDropdownOptions(book)}
                      @dropdown-selected-option=${this._handleDropdownAction}
                    ></dropdown-bks>
                  `
                : ''}
            </div>
            <button
              class="action-btn expand-btn ${isExpanded ? 'expanded' : ''}"
              @click=${() => this._handleRowToggle(book.id)}
              aria-label="Expand book"
              aria-expanded=${isExpanded}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
                <path
                  d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"
                />
              </svg>
            </button>
          </div>
        </div>
        ${isExpanded
          ? html`<div class="card-expanded">
              ${this._renderCopyTable(book.id)}
            </div>`
          : ''}
      </article>
    `;
  }

  _renderBookRow(book) {
    const isbn = this._getPrimaryIsbn(book);
    const isExpanded = this.expandedRows.has(book.id);

    return html`
      <tr>
        <td>
          <div class="book-detail-container">
            ${this._renderCover(isbn)}
            <div class="book-info">
              <span class="book-title">${book.title}</span>
              ${book.publishingYear
                ? html`<span class="book-year"
                    >Published ${book.publishingYear}</span
                  >`
                : ''}
            </div>
          </div>
        </td>
        <td>
          ${Array.isArray(book.authors)
            ? book.authors.map(author => html`<div>${author}</div>`)
            : book.authors || ''}
        </td>
        <td>
          ${Array.isArray(book.genres)
            ? book.genres.map(genre => html`<div>${formatGenre(genre)}</div>`)
            : book.genres || ''}
        </td>
        <td>${book.yearRecommendation?.toUpperCase().replace('_', '-')}</td>
        <td>${book.isbn10 || book.isbn13}</td>
        <td>
          <div
            class="availability-container ${book.countCopies?.availableCopies >
            0
              ? 'available'
              : 'unavailable'}"
            style=${styleMap(this._getAvailabilityStyles(book.countCopies))}
          >
            <span class="availability-text">
              ${book.countCopies?.availableCopies ?? 0} of
              ${book.countCopies?.totalNumberOfCopies ?? 0} available
            </span>
            <div class="availability-bar">
              <div class="availability-bar-fill"></div>
            </div>
          </div>
        </td>
        <td>
          <div class="actions-container">
            <button
              class="action-btn expand-btn ${isExpanded ? 'expanded' : ''}"
              @click=${() => this._handleRowToggle(book.id)}
              aria-label="Expand row"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
                <path
                  d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"
                />
              </svg>
            </button>
            <div class="action-menu-wrapper">
              <button
                class="action-btn menu-btn ${this.openActionMenuId === book.id
                  ? 'active'
                  : ''}"
                aria-label="More actions"
                @click=${e => this._handleActionMenuToggle(e, book.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 -960 960 960"
                >
                  <path
                    d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z"
                  />
                </svg>
              </button>
              ${this.openActionMenuId === book.id
                ? html`
                    <dropdown-bks
                      .options=${this._getDropdownOptions(book)}
                      @dropdown-selected-option=${this._handleDropdownAction}
                    ></dropdown-bks>
                  `
                : ''}
            </div>
          </div>
        </td>
      </tr>
      ${isExpanded ? this._renderExpandedRow(book.id) : ''}
    `;
  }

  _renderCover(isbn) {
    if (!isbn) {
      return html`<div class="cover-placeholder"></div>`;
    }

    const coverUrl = this.coverUrls.get(isbn);

    if (coverUrl === undefined || coverUrl === 'loading') {
      return html`<div class="cover-placeholder cover-loading"></div>`;
    }

    if (coverUrl === null) {
      return html`<div class="cover-placeholder"></div>`;
    }

    return html`<img src="${coverUrl}" alt="Book cover" class="book-cover" />`;
  }

  _renderExpandedRow(bookId) {
    return html`
      <tr class="expanded-row">
        <td colspan="7">
          <div class="expanded-content">${this._renderCopyTable(bookId)}</div>
        </td>
      </tr>
    `;
  }

  _renderCopyTable(bookId) {
    const copiesState = this._bookCopies.get(bookId);
    const book = this.books?.find(b => b.id === bookId);

    return html`
      <copy-table-bks
        .copies=${copiesState?.data ?? []}
        .bookId=${bookId}
        .bookTitle=${book?.title ?? ''}
        .loading=${!copiesState || copiesState.loading}
        .error=${copiesState?.error ?? ''}
        @copy-created=${this._handleCopyCreated}
      ></copy-table-bks>
    `;
  }

  _getPrimaryIsbn(book) {
    return book.isbn13 || book.isbn10 || null;
  }

  _getAvailabilityStyles(countCopies) {
    const percent = countCopies?.totalNumberOfCopies
      ? (countCopies.availableCopies / countCopies.totalNumberOfCopies) * 100
      : 0;
    return { '--availability-percent': `${percent}%` };
  }

  _getPaginationText() {
    const { page, size, totalElements } = this.pageInfo;
    const start = (page - 1) * size + 1;
    const end = Math.min(page * size, totalElements);
    return `Showing ${start} to ${end} of ${totalElements} results`;
  }

  /** @returns {import('../dropdown-bks/dropdown-bks.js').DropdownOption[]} */
  _getDropdownOptions(book) {
    return [
      {
        action: 'update-book',
        data: book,
        path: 'M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z',
        label: 'Update book',
        class: '',
      },
      ...(isAdmin()
        ? [
            {
              action: 'delete-book',
              data: book,
              path: 'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z',
              label: 'Delete book',
              class: 'dropdown-item-danger',
            },
          ]
        : []),
    ];
  }

  _handleRowToggle(bookId) {
    if (this.expandedRows.has(bookId)) {
      this.expandedRows.delete(bookId);
    } else {
      this.expandedRows.add(bookId);
      this._fetchBookCopies(bookId);
    }
    this.requestUpdate();
  }

  _handleActionMenuToggle(e, bookId) {
    e.stopPropagation();
    this.openActionMenuId = this.openActionMenuId === bookId ? null : bookId;
  }

  _handleDropdownAction() {
    // Just close the menu, let the event bubble to parent
    this.openActionMenuId = null;
  }

  _handleOutsideClick(e) {
    if (!this.openActionMenuId) return;
    const path = e.composedPath();
    const clickedOnDropdown = path.some(
      el =>
        el.classList?.contains('action-dropdown') ||
        el.classList?.contains('menu-btn'),
    );
    if (!clickedOnDropdown) {
      this.openActionMenuId = null;
    }
  }

  _handleClickPrevious() {
    this.dispatchEvent(
      new CustomEvent('page-previous', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  _handleClickNext() {
    this.dispatchEvent(
      new CustomEvent('page-next', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  _handleCopyCreated(e) {
    const { bookId } = e.detail;
    this.refreshCopies(bookId);
  }

  refreshCopies(bookId) {
    this._bookCopies.delete(bookId);
    this._fetchBookCopies(bookId);
  }

  async _fetchBookCopies(bookId) {
    if (this._bookCopies.has(bookId)) return;

    this._bookCopies.set(bookId, { loading: true });
    this.requestUpdate();

    try {
      const data = await getBookCopies(bookId);
      this._bookCopies.set(bookId, { data: data.data, loading: false });
    } catch (err) {
      this._bookCopies.set(bookId, { error: err.message, loading: false });
    }
    this.requestUpdate();
  }
}

customElements.define('book-table-bks', BookTableBks);
