import { LitElement, html, nothing } from 'lit';
import { Task } from '@lit/task';
import { catalogView } from './catalog-view-styles.js';
import { sharedStyles } from '../../shared-styles.js';
import '../../components/button-bks/button-bks.js';
import '../../components/search-bar-bks/search-bar-bks.js';
import '../../features/book/book-form-bks/book-form-bks.js';
import '../../features/book/book-table-bks/book-table-bks.js';
import { getBooks } from '../../api/book.js';
import { getBorrowingByCopyId } from '../../api/borrowing.js';
import { BookService } from '../../api/bookService.js';
import { toFormFormat } from '../../utils/bookMapper.js';
import { SearchController } from '../../controllers/search-controller.js';
import { CoverController } from '../../controllers/cover-controller.js';
import '../../features/copy/copy-qr-modal-bks/copy-qr-modal-bks.js';
import '../../features/book/delete-book-modal-bks/delete-book-modal-bks.js';
import '../../features/copy/copy-section-modal-bks/copy-section-modal-bks.js';
import '../../features/copy/delete-copy-modal-bks/delete-copy-modal-bks.js';
import '../../features/copy/copy-status-modal-bks/copy-status-modal-bks.js';
import '../../features/book/create-book-bks/create-book-bks.js';
import '../../features/borrowing/loan-modal-bks/loan-modal-bks.js';
import '../../features/borrowing/return-modal-bks/return-modal-bks.js';
import '../../features/hold/hold-modal-bks/hold-modal-bks.js';
import '../../components/info-modal-bks/info-modal-bks.js';
import '../../features/book/deletion-blockers-bks/deletion-blockers-bks.js';
import '../../features/lifecycle/history-modal-bks/history-modal-bks.js';

export class CatalogView extends LitElement {
  static styles = [catalogView, sharedStyles];

  static properties = {
    page: { type: Number },
    size: { type: Number },
    bookToDelete: { type: Object, state: true },
    bookToUpdate: { type: Object, state: true },
    qrCopy: { type: Object, state: true },
    copyToUpdate: { type: Object, state: true },
    copyToDelete: { type: Object, state: true },
    copyToChangeStatus: { type: Object, state: true },
    copyToBorrow: { type: Object, state: true },
    borrowingToReturn: { type: Object, state: true },
    bookToHold: { type: Object, state: true },
    showCreateModal: { type: Boolean, state: true },
    updateError: { type: String, state: true },
    deleteRefusal: { type: Object, state: true },
    historyTarget: { type: Object, state: true },
  };

  _search = new SearchController(this, {
    onResults: results => this._covers.fetchForBooks(results.results),
  });

  _covers = new CoverController(this);

  /** Primary ISBN of the book currently open in the update modal, before any edit */
  _updateOriginalIsbn = null;

  constructor() {
    super();
    this.page = 1;
    this.size = 10;
    this.bookToDelete = null;
    this.bookToUpdate = null;
    this.qrCopy = null;
    this.copyToUpdate = null;
    this.copyToDelete = null;
    this.copyToChangeStatus = null;
    this.copyToBorrow = null;
    this.borrowingToReturn = null;
    this.bookToHold = null;
    this.showCreateModal = false;
    this.updateError = '';
    this.deleteRefusal = null;
    this.historyTarget = null;
  }

  booksTask = new Task(this, {
    task: async ([page, size]) => {
      const data = await getBooks(page, size);
      this._covers.fetchForBooks(data.data);
      return data;
    },
    args: () => [this.page, this.size],
  });

  render() {
    return html`
      ${this._headerTpl} ${this._searchbarTpl} ${this._tableTpl}
      ${this._deleteModalTpl} ${this._updateModalTpl} ${this._createModalTpl}
      ${this._createBookBksTpl} ${this._qrModalTpl} ${this._updateCopyModalTpl}
      ${this._deleteCopyModalTpl} ${this._loanModalTpl} ${this._returnModalTpl}
      ${this._holdModalTpl} ${this._deleteRefusalTpl}
      ${this._copyStatusModalTpl} ${this._historyModalTpl}
    `;
  }

  get _deleteRefusalTpl() {
    const { activeBorrowings = [], activeHolds = [] } =
      this.deleteRefusal ?? {};
    const hasBlockers = activeBorrowings.length > 0 || activeHolds.length > 0;

    return html`
      <info-modal-bks
        ?open=${!!this.deleteRefusal}
        .heading=${this.deleteRefusal?.heading ?? ''}
        .message=${hasBlockers ? '' : (this.deleteRefusal?.message ?? '')}
        @modal-close=${this._handleDeleteRefusalClose}
      >
        ${hasBlockers
          ? html`<deletion-blockers-bks
              .activeBorrowings=${activeBorrowings}
              .activeHolds=${activeHolds}
            ></deletion-blockers-bks>`
          : nothing}
      </info-modal-bks>
    `;
  }

  // Dismiss the confirmation here so only one modal-bks is on screen
  _handleDeleteRefused(e) {
    this.bookToDelete = null;
    this.copyToDelete = null;
    this.deleteRefusal = {
      heading: 'Deletion refused',
      message: e.detail.message,
      activeBorrowings: e.detail.activeBorrowings,
      activeHolds: e.detail.activeHolds,
    };
  }

  _handleDeleteRefusalClose() {
    this.deleteRefusal = null;
  }

  get _deleteModalTpl() {
    return html`
      <delete-book-modal-bks
        ?open=${!!this.bookToDelete}
        .book=${this.bookToDelete}
        @modal-close=${this._handleDeleteModalClose}
        @book-deleted=${this._handleBookDeleted}
        @delete-refused=${this._handleDeleteRefused}
      ></delete-book-modal-bks>
    `;
  }

  get _updateModalTpl() {
    if (!this.bookToUpdate) return '';

    return html`
      <div
        class="update-modal-overlay"
        role="presentation"
        @click=${this._handleUpdateModalClose}
      >
        <div
          class="update-modal-content"
          role="dialog"
          aria-labelledby="update-modal-title"
          @keydown=${e => e.stopPropagation()}
          @click=${e => e.stopPropagation()}
        >
          <button
            class="close-modal-btn"
            type="button"
            aria-label="Close"
            @click=${this._handleUpdateModalClose}
          >
            &times;
          </button>
          <h2 id="update-modal-title">Update Book</h2>
          ${this.updateError
            ? html`<p class="update-error">${this.updateError}</p>`
            : ''}
          <book-form-bks
            mode="update"
            .book=${this.bookToUpdate}
            @book-submit=${this._handleUpdateSubmit}
          ></book-form-bks>
        </div>
      </div>
    `;
  }

  get _headerTpl() {
    return html`
      <div class="header">
        <div class="header-title">
          <h1>Library Catalog</h1>
          <p>Manage and browse the entire book collection</p>
        </div>
        <button-bks
          label="New Book"
          icon="add"
          @click=${this._handleOpenCreateModal}
        ></button-bks>
      </div>
    `;
  }

  get _searchbarTpl() {
    return html`
      <search-bar-bks
        .query=${this._search.query}
        @search-input=${this._handleSearchInput}
        @filters-changed=${this._handleFiltersChanged}
      ></search-bar-bks>
    `;
  }

  get _tableTpl() {
    // If searching, show search results
    if (this._search.isActive) {
      if (this._search.isSearching) {
        return html`<spinner-bks></spinner-bks>`;
      }
      if (this._search.results) {
        return this._renderBookTable(this._search.results.results, true);
      }
      return html`<p>No results found</p>`;
    }

    // Otherwise, show paginated books
    return this.booksTask.render({
      pending: () => html`<spinner-bks></spinner-bks>`,
      complete: books => this._renderBookTable(books.data, false, books.page),
      error: err => html`<p>Error loading books: ${err.message}</p>`,
    });
  }

  _renderBookTable(books, isSearchMode, pageInfo = null) {
    return html`
      <book-table-bks
        .books=${books}
        .coverUrls=${this._covers.urls}
        .isSearchMode=${isSearchMode}
        .searchQuery=${this._search.query}
        .searchGenre=${this._search.genres}
        .searchStatus=${this._search.copyStatus}
        .searchResultCount=${this._search.results?.count ?? 0}
        .pageInfo=${{
          page: pageInfo?.page ?? this.page,
          size: pageInfo?.size ?? this.size,
          totalElements: pageInfo?.totalElements ?? 0,
        }}
        @dropdown-selected-option=${this._handleDropdownAction}
        @page-previous=${this._handleClickPrevious}
        @page-next=${this._handleClickNext}
      ></book-table-bks>
    `;
  }

  _handleDropdownAction(e) {
    const { action, data } = e.detail;

    switch (action) {
      case 'update-book':
        this._handleUpdateBook(data);
        break;
      case 'delete-book':
        this._handleDeleteBook(data);
        break;
      case 'print-qr-code':
        this._handlePrintQrCode(data);
        break;
      case 'update-section':
        this._handleUpdateCopy(data);
        break;
      case 'update-status':
        this.copyToChangeStatus = data;
        break;
      case 'delete-copy':
        this._handleDeleteCopy(data);
        break;
      case 'borrow-book':
      case 'hand-over-hold':
        this._handleBorrowBook(data);
        break;
      case 'return-book':
        this._handleReturnBook(data);
        break;
      case 'hold-book':
        this._handleHoldBook(data);
        break;
      case 'view-book-history':
        this.historyTarget = { kind: 'book', id: data.id, title: data.title };
        break;
      case 'view-copy-history':
        this.historyTarget = {
          kind: 'copy',
          id: data.id,
          title: data.bookTitle,
          identificationCode: data.section.id,
        };
        break;
      default:
        break;
    }
  }

  _handleUpdateBook(book) {
    const isbn = book.isbn13 || book.isbn10;
    const bookWithCover = {
      ...book,
      coverUrl: isbn ? this._covers.get(isbn) : null,
    };

    // Remembered so a changed ISBN can drop the cover cached under the old key
    this._updateOriginalIsbn = isbn || null;
    this.bookToUpdate = toFormFormat(bookWithCover);
  }

  _handleUpdateModalClose() {
    this.bookToUpdate = null;
    this.updateError = '';
    this._updateOriginalIsbn = null;
  }

  get _createModalTpl() {
    if (!this.showCreateModal) return '';

    return html`
      <div
        class="update-modal-overlay"
        role="presentation"
        @click=${this._handleCreateModalClose}
      >
        <div
          class="update-modal-content"
          role="dialog"
          aria-labelledby="create-modal-title"
          @keydown=${e => e.stopPropagation()}
          @click=${e => e.stopPropagation()}
        >
          <button
            class="close-modal-btn"
            type="button"
            aria-label="Close"
            @click=${this._handleCreateModalClose}
          >
            &times;
          </button>
          <h2 id="create-modal-title">Add New Book</h2>
          <book-form-bks
            mode="create"
            @book-submit=${this._handleCreateSubmit}
          ></book-form-bks>
        </div>
      </div>
    `;
  }

  get _createBookBksTpl() {
    return html`
      <create-book-bks
        @book-created=${this._handleBookCreated}
        @modal-close=${this._handleCreateBookModalClose}
      ></create-book-bks>
    `;
  }

  _handleOpenCreateModal() {
    this.showCreateModal = true;
  }

  _handleCreateModalClose() {
    this.showCreateModal = false;
  }

  async _handleCreateSubmit(e) {
    const { bookData, cover } = e.detail;
    await this.shadowRoot
      .querySelector('create-book-bks')
      .submitBook(bookData, cover);
  }

  _handleBookCreated() {
    this._refreshList();
  }

  _handleCreateBookModalClose() {
    this.showCreateModal = false;
  }

  async _handleUpdateSubmit(e) {
    const { bookData, cover, coverChanged } = e.detail;
    this.updateError = '';

    let result;
    try {
      result = await BookService.updateBook(bookData, { cover, coverChanged });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to update book:', err);
      this.updateError = 'The book could not be saved. Please try again.';
      return;
    }

    // The server moves the cover when the ISBN changes, so both keys are now stale
    const previousIsbn = this._updateOriginalIsbn;
    const isbnChanged = previousIsbn !== result.isbn;

    if (previousIsbn && isbnChanged) {
      this._covers.invalidate(previousIsbn);
    }
    if (result.isbn && (result.coverUpdated || isbnChanged)) {
      // The cached object URL still points at the previous image
      this._covers.invalidate(result.isbn);
    }

    if (result.coverError) {
      // The book was saved; keep the modal open so the cover failure is visible
      this.updateError = `The book was saved, but its cover was not updated — ${result.coverError}`;
      this._refreshList();
      return;
    }

    this.bookToUpdate = null;
    this._updateOriginalIsbn = null;
    this._refreshList();
  }

  _handleDeleteBook(book) {
    this.bookToDelete = book;
  }

  _handleDeleteModalClose() {
    this.bookToDelete = null;
  }

  _handleBookDeleted() {
    this.bookToDelete = null;
    this._refreshList();
  }

  _handleClickPrevious() {
    if (this.page > 1) {
      this.page -= 1;
    }
  }

  _handleClickNext() {
    this.page += 1;
  }

  _handleSearchInput(e) {
    this._search.updateQuery(e.detail.value);
  }

  _handleFiltersChanged(e) {
    this._search.updateFilters(e.detail);
  }

  get _qrModalTpl() {
    return html`
      <copy-qr-modal-bks
        ?open=${!!this.qrCopy}
        .copy=${this.qrCopy}
        @modal-close=${this._handleQrModalClose}
      ></copy-qr-modal-bks>
    `;
  }

  _handlePrintQrCode(copy) {
    this.qrCopy = copy;
  }

  _handleQrModalClose() {
    this.qrCopy = null;
  }

  get _updateCopyModalTpl() {
    return html`
      <copy-section-modal-bks
        ?open=${!!this.copyToUpdate}
        .copy=${this.copyToUpdate}
        @modal-close=${this._handleUpdateCopyModalClose}
        @section-updated=${this._handleSectionUpdated}
      ></copy-section-modal-bks>
    `;
  }

  _handleUpdateCopy(copy) {
    this.copyToUpdate = copy;
  }

  _handleUpdateCopyModalClose() {
    this.copyToUpdate = null;
  }

  _handleSectionUpdated(e) {
    const { bookId } = e.detail;
    this.copyToUpdate = null;

    if (bookId) {
      this.shadowRoot.querySelector('book-table-bks')?.refreshCopies(bookId);
    }
  }

  get _copyStatusModalTpl() {
    return html`
      <copy-status-modal-bks
        ?open=${!!this.copyToChangeStatus}
        .copy=${this.copyToChangeStatus}
        @modal-close=${this._handleCopyStatusModalClose}
        @copy-status-changed=${this._handleCopyStatusChanged}
      ></copy-status-modal-bks>
    `;
  }

  _handleCopyStatusModalClose() {
    this.copyToChangeStatus = null;
  }

  // A copy set aside for a student keeps the modal open: the librarian has to read who it is for
  _handleCopyStatusChanged(e) {
    const { bookId, setAside } = e.detail;

    if (!setAside) {
      this.copyToChangeStatus = null;
    }
    this._refreshCopiesOf(bookId);
  }

  get _historyModalTpl() {
    return html`
      <history-modal-bks
        ?open=${!!this.historyTarget}
        .target=${this.historyTarget}
        @modal-close=${this._handleHistoryModalClose}
      ></history-modal-bks>
    `;
  }

  _handleHistoryModalClose() {
    this.historyTarget = null;
  }

  get _deleteCopyModalTpl() {
    return html`
      <delete-copy-modal-bks
        ?open=${!!this.copyToDelete}
        .copy=${this.copyToDelete}
        @modal-close=${this._handleDeleteCopyModalClose}
        @copy-deleted=${this._handleCopyDeleted}
        @delete-refused=${this._handleDeleteRefused}
      ></delete-copy-modal-bks>
    `;
  }

  _handleDeleteCopy(copy) {
    this.copyToDelete = copy;
  }

  _handleDeleteCopyModalClose() {
    this.copyToDelete = null;
  }

  _handleCopyDeleted(e) {
    const { bookId } = e.detail;
    this.copyToDelete = null;

    if (bookId) {
      this.shadowRoot.querySelector('book-table-bks')?.refreshCopies(bookId);
    }
  }

  get _loanModalTpl() {
    return html`
      <loan-modal-bks
        ?open=${!!this.copyToBorrow}
        .copyId=${this.copyToBorrow?.copyId}
        .bookTitle=${this.copyToBorrow?.bookTitle}
        .unavailable=${!!this.copyToBorrow?.unavailable}
        .copyStatus=${this.copyToBorrow?.copyStatus ?? ''}
        .hold=${this.copyToBorrow?.hold ?? null}
        @modal-close=${this._handleLoanModalClose}
        @loan-created=${this._handleLoanCreated}
        @copy-unavailable=${this._handleCopyUnavailable}
      ></loan-modal-bks>
    `;
  }

  // Same flow as scanning the copy's QR code, minus the scan: the copy id is
  // already known, so go straight to confirming the copy can still be lent.
  async _handleBorrowBook(copy) {
    try {
      const result = await getBorrowingByCopyId(copy.id);
      // Either the copy is free, or it is set aside for a student who is here to
      // collect it — that loan fulfills their hold
      const hold = result?.copyStatus === 'on_hold' ? result.hold : null;
      const canLend = result?.copyStatus === 'available' || !!hold;

      this.copyToBorrow = {
        copyId: String(copy.id),
        bookTitle: result?.bookTitle ?? copy.bookTitle,
        bookId: copy.bookId,
        hold,
        // The table can be out of date: another librarian may have lent this
        // copy since the row was rendered
        unavailable: !canLend,
        copyStatus: result?.copyStatus,
      };

      if (!canLend) {
        this._refreshCopiesOf(copy.bookId);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to check copy ${copy.id} before lending:`, err);
    }
  }

  _handleLoanModalClose() {
    this.copyToBorrow = null;
  }

  _handleLoanCreated() {
    this._refreshCopiesOf(this.copyToBorrow?.bookId);
  }

  // The loan was refused because the copy was taken in the meantime
  _handleCopyUnavailable() {
    this._refreshCopiesOf(this.copyToBorrow?.bookId);
  }

  get _returnModalTpl() {
    return html`
      <return-modal-bks
        ?open=${!!this.borrowingToReturn}
        .borrowingId=${this.borrowingToReturn?.id}
        .bookTitle=${this.borrowingToReturn?.bookTitle ?? ''}
        .studentName=${this.borrowingToReturn?.studentName ?? ''}
        .notLoaned=${!!this.borrowingToReturn?.notLoaned}
        @modal-close=${this._handleReturnModalClose}
        @borrowing-returned=${this._handleBorrowingReturned}
      ></return-modal-bks>
    `;
  }

  // The row only says the copy is borrowed; who has it comes from the same lookup the
  // scanner uses, which also catches a row that went stale.
  async _handleReturnBook(copy) {
    try {
      const result = await getBorrowingByCopyId(copy.id);
      const borrowing = result?.borrowing;

      this.borrowingToReturn = {
        id: borrowing?.id,
        bookId: copy.bookId,
        bookTitle: result?.bookTitle ?? copy.bookTitle,
        studentName: borrowing
          ? `${borrowing.firstName} ${borrowing.lastName}`
          : '',
        notLoaned: !borrowing,
      };

      if (!borrowing) {
        this._refreshCopiesOf(copy.bookId);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to look up the loan on copy ${copy.id}:`, err);
    }
  }

  _handleReturnModalClose() {
    this.borrowingToReturn = null;
  }

  _handleBorrowingReturned() {
    this._refreshCopiesOf(this.borrowingToReturn?.bookId);
  }

  get _holdModalTpl() {
    return html`
      <hold-modal-bks
        ?open=${!!this.bookToHold}
        .bookId=${this.bookToHold?.bookId}
        .bookTitle=${this.bookToHold?.bookTitle}
        @modal-close=${this._handleHoldModalClose}
      ></hold-modal-bks>
    `;
  }

  _handleHoldBook(copy) {
    this.bookToHold = {
      bookId: copy.bookId,
      bookTitle: copy.bookTitle,
    };
  }

  _handleHoldModalClose() {
    this.bookToHold = null;
  }

  _refreshCopiesOf(bookId) {
    if (bookId) {
      this.shadowRoot.querySelector('book-table-bks')?.refreshCopies(bookId);
    }
  }

  _refreshList() {
    if (this._search.isActive) {
      this._search.performSearch();
    } else {
      this.booksTask.run();
    }
  }
}

customElements.define('catalog-view', CatalogView);
