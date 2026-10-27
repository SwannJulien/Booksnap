import { LitElement, html } from 'lit';
import '../../components/button-bks/button-bks.js';
import '../../features/book/book-form-bks/book-form-bks.js';
import '../../components/spinner-bks/spinner-bks.js';
import '../../features/book/create-book-bks/create-book-bks.js';
import { addBookView } from './add-book-view-styles.js';
import { sharedStyles } from '../../shared-styles.js';
import { BookService } from '../../api/bookService.js';

export class AddBookView extends LitElement {
  static styles = [sharedStyles, addBookView];

  static properties = {
    activeTab: { type: String },
    book: { type: Object },
    isbn: { type: String },
    isFetching: { type: Boolean },
    showBookForm: { type: Boolean },
    showNotFound: { type: Boolean },
    _scannerLoaded: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.activeTab = 'scan';
    this.book = null;
    this.isbn = '';
    this.isFetching = false;
    this.showBookForm = false;
    this.showNotFound = false;
    this._scannerLoaded = false;
    this._resetOnModalClose = false;
  }

  firstUpdated() {
    if (this.activeTab === 'scan') {
      this._loadScanner();
    }
  }

  // The scanner pulls in the whole barcode library, so it is only fetched once
  // the scan tab is shown. The promise is kept so it is imported only once.
  async _loadScanner() {
    if (!this._scannerImport) {
      this._scannerImport = import(
        '../../features/scanner/barcode-scanner-bks/barcode-scanner-bks.js'
      );
    }
    await this._scannerImport;
    this._scannerLoaded = true;
  }

  render() {
    return html`
      <div class="header">
        <h1>Add a new book</h1>
        <p>
          Add a new book by scanning its barcode or by entering its ISBN or by
          filling all the information manually
        </p>
      </div>
      <div class="tabs">${this._renderTabs()}</div>
      <div class="card">${this._renderTabContent()}</div>
      <create-book-bks
        @book-created=${this._handleBookCreated}
        @modal-close=${this._handleModalClose}
      ></create-book-bks>
    `;
  }

  _renderTabs() {
    return html`
      <button
        class=${this.activeTab === 'scan' ? 'active' : ''}
        @click=${() => this._switchTab('scan')}
      >
        Scan Barcode
      </button>
      <button
        class=${this.activeTab === 'isbn' ? 'active' : ''}
        @click=${() => this._switchTab('isbn')}
      >
        Enter ISBN
      </button>
      <button
        class=${this.activeTab === 'form' ? 'active' : ''}
        @click=${() => this._switchTab('form')}
      >
        Fill Form
      </button>
    `;
  }

  _renderTabContent() {
    switch (this.activeTab) {
      case 'scan':
        return this._renderScanTab();
      case 'isbn':
        return this._renderIsbnTab();
      case 'form':
        return this._renderFormTab();
      default:
        return this._renderScanTab();
    }
  }

  _renderScanTab() {
    return html`
      <h2 class="card-title">
        ${this.showBookForm ? 'Review the details' : "Scan your book's barcode"}
      </h2>

      ${this.isFetching
        ? html`<spinner-bks></spinner-bks>`
        : this._renderScanner()}
      ${this.showBookForm
        ? html`<book-form-bks
            .book=${this.book}
            @book-submit=${this._handleBookSubmit}
            @cover-error=${this._handleCoverError}
          ></book-form-bks>`
        : ''}
    `;
  }

  _renderScanner() {
    if (!this._scannerLoaded) {
      return html`<spinner-bks ?hidden=${this.showBookForm}></spinner-bks>`;
    }

    return html`
      <barcode-scanner-bks
        mode="barcode"
        ?hidden=${this.showBookForm}
        @sendBarcode=${this._handleIsbnInput}
      ></barcode-scanner-bks>
    `;
  }

  _renderIsbnTab() {
    return html`
      <h2 class="card-title">
        ${this.showBookForm
          ? 'Review the details'
          : "Enter your book's ISBN"}
      </h2>
      ${this.isFetching
        ? html`<spinner-bks></spinner-bks>`
        : html`
            <form
              class="find-by-isbn-form"
              ?hidden=${this.showBookForm}
              @submit=${this._handleIsbnFormSubmit}
            >
              <input
                type="text"
                name="isbn"
                .value=${this.isbn}
                placeholder="Enter ISBN here"
                minlength="10"
                maxlength="13"
                pattern="\\d{10}(\\d{3})?"
                required
                @input=${e => {
                  this.isbn = e.target.value;
                }}
              />
              <button-bks
                type="submit"
                label="Submit ISBN"
                ?disabled=${!this._isIsbnFormValid()}
              ></button-bks>
            </form>
          `}
      ${this.showBookForm
        ? html`<book-form-bks
            .book=${this.book}
            @book-submit=${this._handleBookSubmit}
            @cover-error=${this._handleCoverError}
          ></book-form-bks>`
        : ''}
    `;
  }

  _renderFormTab() {
    return html`
      <h2 class="card-title">Fill in the book details</h2>
      <book-form-bks
        .book=${this.book}
        @book-submit=${this._handleBookSubmit}
        @cover-error=${this._handleCoverError}
      ></book-form-bks>
    `;
  }

  async _switchTab(tabName) {
    this.activeTab = tabName;
    this.showBookForm = tabName === 'form';
    this.showNotFound = false;
    this.isbn = '';

    if (tabName !== 'form') {
      this.book = null;
    }

    if (tabName === 'scan') {
      this._loadScanner();
    }

    await this.updateComplete;

    // Reset forms
    if (tabName === 'isbn') {
      this.renderRoot?.querySelector('.find-by-isbn-form')?.reset();
    }

    const bookForm = this.renderRoot?.querySelector('book-form-bks');
    if (bookForm && tabName === 'form') {
      bookForm.reset();
    }
  }

  _isIsbnFormValid() {
    const form = this.renderRoot?.querySelector('.find-by-isbn-form');
    return Boolean(form && form.checkValidity());
  }

  async _handleIsbnInput(e) {
    const isbn = e.detail.code ? e.detail.code.trim() : this.isbn.trim();
    await this._fetchBookByIsbn(isbn);
  }

  async _handleIsbnFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const { isbn } = Object.fromEntries(formData.entries());
    await this._fetchBookByIsbn(isbn);
  }

  async _fetchBookByIsbn(isbn) {
    this.isbn = isbn;
    this.isFetching = true;
    this.showNotFound = false;

    try {
      this.book = await BookService.fetchByIsbn(isbn);
      this.showBookForm = true;
    } catch (err) {
      this.showNotFound = true;
    } finally {
      this.isFetching = false;
    }
  }

  async _handleBookSubmit(e) {
    const { bookData, cover } = e.detail;

    this.isFetching = true;

    try {
      await this.shadowRoot
        .querySelector('create-book-bks')
        .submitBook(bookData, cover);
    } finally {
      this.isFetching = false;
    }
  }

  // The tab is not cleared until the confirmation modal is closed, so the
  // librarian can still read the details behind it while printing the QR code.
  _handleBookCreated() {
    this._resetOnModalClose = true;
  }

  // modal-close can reach the view twice (from modal-bks and from
  // create-book-bks), so the flag also keeps the reset from running twice.
  _handleModalClose() {
    if (!this._resetOnModalClose) {
      return;
    }
    this._resetOnModalClose = false;
    this._switchTab(this.activeTab);
  }

  _handleCoverError(e) {
    this.shadowRoot
      .querySelector('create-book-bks')
      .showError(e.detail.message);
  }
}

customElements.define('add-book-view', AddBookView);
