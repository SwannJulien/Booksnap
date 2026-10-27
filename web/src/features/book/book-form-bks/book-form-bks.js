import { LitElement, html } from 'lit';
import { bookFormBksStyles } from './book-form-bks-styles.js';
import { sharedStyles } from '../../../shared-styles.js';
import '../../../components/button-bks/button-bks.js';
import '../../cover/cover-upload-bks/cover-upload-bks.js';
import '../../../components/spinner-bks/spinner-bks.js';
import {
  getDeweyClasses,
  getDeweyDivisions,
  getDeweyCategories,
} from '../../../api/dewey.js';

export class BookFormBks extends LitElement {
  static styles = [sharedStyles, bookFormBksStyles];

  static properties = {
    book: { type: Object },
    mode: { type: String }, // 'create' or 'update'
    isLoading: { type: Boolean },
    isFiction: { type: Boolean },
    deweyClasses: { type: Array },
    deweyDivisions: { type: Array },
    deweyCategories: { type: Array },
    selectedClass: { type: String },
    selectedDivision: { type: String },
    selectedCategory: { type: String },
  };

  constructor() {
    super();
    this.book = null;
    this.mode = 'create';
    this.isLoading = false;
    this.isFiction = null;
    this.deweyClasses = [];
    this.deweyDivisions = [];
    this.deweyCategories = [];
    this.selectedClass = '';
    this.selectedDivision = '';
    this.selectedCategory = '';
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('book') && this.book?.isFiction !== undefined) {
      this.isFiction = this.book.isFiction;
    }
    if (
      changedProperties.has('book') &&
      this.mode === 'update' &&
      this.book?.isFiction === false
    ) {
      this._loadDeweyChain(this.book.codeDewey);
    }
  }

  async _loadDeweyChain(codeDewey) {
    try {
      this.deweyClasses = await getDeweyClasses();
      if (codeDewey) {
        // Codes are hierarchical: category 523 is in division 520, class 500
        this.selectedClass = `${codeDewey[0]}00`;
        this.deweyDivisions = await getDeweyDivisions(this.selectedClass);
        this.selectedDivision = `${codeDewey.slice(0, 2)}0`;
        this.deweyCategories = await getDeweyCategories(this.selectedDivision);
        this.selectedCategory = codeDewey;
      }
    } catch (error) {
      console.error('Failed to load Dewey classification:', error);
    }
    // The submit button reads form validity during render, before the selects get their values
    await this.updateComplete;
    this.requestUpdate();
  }

  updated(changedProperties) {
    // In update mode, pre-populate values after render
    if (changedProperties.has('book') && this.mode === 'update' && this.book) {
      const isFictionSelect = this.shadowRoot?.querySelector('#type');
      if (isFictionSelect && this.book.isFiction !== undefined) {
        isFictionSelect.value = this.book.isFiction ? 'true' : 'false';
      }

      const yearRecoSelect = this.shadowRoot?.querySelector(
        '#yearRecommendation',
      );
      if (yearRecoSelect && this.book.yearRecommendation) {
        yearRecoSelect.value = this.book.yearRecommendation;
      }
    }
  }

  render() {
    if (this.isLoading) {
      return html`<spinner-bks></spinner-bks>`;
    }

    return html`
      <div class="cover-section">
        <cover-upload-bks
          id="cover-upload"
          .coverUrl=${this.book?.cover?.medium || null}
        ></cover-upload-bks>
      </div>

      <form
        class="book-form ${this.mode === 'update' ? 'update' : ''}"
        @submit=${this._handleSubmit}
      >
        <label for="title" class="required">Title</label>
        <input
          id="title"
          type="text"
          name="title"
          .defaultValue="${this.book?.title || ''}"
          placeholder="Book title"
          pattern="^[A-Za-z0-9\\u00C0-\\u017F\\s:',.!?&\\(\\)\\-]{1,255}$"
          required
          @input=${() => {
            this.requestUpdate();
          }}
        />

        <label for="authors" class="required">Author</label>
        <input
          id="authors"
          type="text"
          name="authors"
          .defaultValue="${this.book?.authors
            ?.map(author => author.name)
            .join(', ') || ''}"
          placeholder="Comma separated authors"
          pattern="^[A-Za-z\\u00C0-\\u017F\\s.,'\\(\\)\\-]{1,500}$"
          required
          @input=${() => {
            this.requestUpdate();
          }}
        />

        <label for="publishingYear">Publish Year</label>
        <input
          id="publishingYear"
          type="number"
          name="publishingYear"
          .defaultValue="${this.book?.publish_date || ''}"
          placeholder="e.g.: 2021"
          min="1000"
          max="${new Date().getFullYear()}"
        />

        <label for="publisher">Publisher</label>
        <input
          id="publisher"
          type="text"
          name="publisher"
          .defaultValue="${this._getPublisher()}"
          placeholder="e.g.: Penguin books"
          pattern="^[A-Za-z0-9\\u00C0-\\u017F\\s:',.!?&\\(\\)\\-]{1,255}$"
        />

        <label for="isbn" class="required">ISBN</label>
        <input
          id="isbn"
          type="text"
          name="isbn"
          .defaultValue="${this.book?.identifiers?.isbn_10?.[0] ||
          this.book?.identifiers?.isbn_13?.[0] ||
          ''}"
          placeholder="ISBN 10 or ISBN 13"
          minlength="10"
          maxlength="13"
          pattern="\\d{10}(\\d{3})?"
          required
          @input=${() => {
            this.requestUpdate();
          }}
        />

        <label for="isFiction" class="required">Book type</label>
        <select
          id="type"
          name="isFiction"
          required
          @change=${this._handleIsFictionChange}
        >
          <option value="" disabled selected hidden>Select book type</option>
          <option value="true">Fiction</option>
          <option value="false">Non-fiction</option>
        </select>

        ${this.isFiction === false ? this._renderDeweySection() : ''}

        <label for="numberOfPages">Number of pages</label>
        <input
          id="numberOfPages"
          type="number"
          name="numberOfPages"
          .defaultValue="${this.book?.number_of_pages || ''}"
          placeholder="e.g.: 350"
          min="1"
          max="99999"
        />

        <label for="yearRecommendation">Year recommendation</label>
        <select id="yearRecommendation" name="yearRecommendation">
          <option value="" disabled selected hidden>
            Select Key Stage reading recommendation
          </option>
          <option value="pre_school">Pre-school</option>
          <option value="ks_1">KS-1</option>
          <option value="ks_2">KS-2</option>
          <option value="ks_3">KS-3</option>
          <option value="ks_4">KS-4</option>
          <option value="ks_5">KS-5</option>
        </select>

        ${this.mode !== 'update'
          ? html`
              <label for="sectionName" class="required">Section</label>
              <input
                id="sectionName"
                type="text"
                name="sectionName"
                .defaultValue="${this.book?.sectionName || ''}"
                placeholder="e.g.: 19's century litterature, Foreign languages"
                pattern="^[A-Za-z0-9\\u00C0-\\u017F\\s,.' \\-]{1,500}$"
                required
                @input=${() => {
                  this.requestUpdate();
                }}
              />
            `
          : ''}

        <label for="genres">Genres</label>
        <input
          id="genres"
          type="text"
          name="genres"
          .defaultValue="${this.book?.genres?.join(', ') || ''}"
          placeholder="Comma separated genres"
          pattern="^[A-Za-z0-9\\u00C0-\\u017F\\s,.' \\-]{1,500}$"
        />

        <p class="required-note"><span>*</span> Required fields</p>

        <button-bks
          type="submit"
          label="${this.mode === 'update' ? 'Update Book' : 'Submit'}"
          ?disabled=${!this._isFormValid()}
        ></button-bks>
      </form>
    `;
  }

  _renderDeweySection() {
    return html`
      <label for="deweyClass" class="required">Dewey Class</label>
      <select id="deweyClass" required @change=${this._handleClassChange}>
        <option value="" disabled selected hidden>Select a class</option>
        ${this.deweyClasses.map(
          c =>
            html`<option
              value="${c.code}"
              ?selected=${c.code === this.selectedClass}
            >
              ${c.code} - ${c.name}
            </option>`,
        )}
      </select>

      ${this.selectedClass
        ? html`
            <label for="deweyDivision" class="required">Dewey Division</label>
            <select
              id="deweyDivision"
              required
              @change=${this._handleDivisionChange}
            >
              <option value="" disabled selected hidden>
                Select a division
              </option>
              ${this.deweyDivisions.map(
                d =>
                  html`<option
                    value="${d.code}"
                    ?selected=${d.code === this.selectedDivision}
                  >
                    ${d.code} - ${d.name}
                  </option>`,
              )}
            </select>
          `
        : ''}
      ${this.selectedDivision
        ? html`
            <label for="deweyCategory" class="required">Dewey Category</label>
            <select
              id="deweyCategory"
              name="codeDewey"
              required
              @change=${this._handleCategoryChange}
            >
              <option value="" disabled selected hidden>
                Select a category
              </option>
              ${this.deweyCategories.map(
                c =>
                  html`<option
                    value="${c.code}"
                    ?selected=${c.code === this.selectedCategory}
                  >
                    ${c.code} - ${c.name}
                  </option>`,
              )}
            </select>
          `
        : ''}
    `;
  }

  async _handleIsFictionChange(e) {
    this.isFiction = e.target.value === 'true';
    this.requestUpdate();

    if (!this.isFiction && this.deweyClasses.length === 0) {
      try {
        this.deweyClasses = await getDeweyClasses();
      } catch (error) {
        console.error('Failed to load Dewey classes:', error);
      }
    }

    if (this.isFiction) {
      this._resetDeweySelection();
    }
  }

  async _handleClassChange(e) {
    this.selectedClass = e.target.value;
    this.selectedDivision = '';
    this.selectedCategory = '';
    this.deweyDivisions = [];
    this.deweyCategories = [];

    if (this.selectedClass) {
      try {
        this.deweyDivisions = await getDeweyDivisions(this.selectedClass);
      } catch (error) {
        console.error('Failed to load Dewey divisions:', error);
      }
    }
    this.requestUpdate();
  }

  async _handleDivisionChange(e) {
    this.selectedDivision = e.target.value;
    this.selectedCategory = '';
    this.deweyCategories = [];

    if (this.selectedDivision) {
      try {
        this.deweyCategories = await getDeweyCategories(this.selectedDivision);
      } catch (error) {
        console.error('Failed to load Dewey categories:', error);
      }
    }
    this.requestUpdate();
  }

  _handleCategoryChange(e) {
    this.selectedCategory = e.target.value;
    this.requestUpdate();
  }

  _resetDeweySelection() {
    this.selectedClass = '';
    this.selectedDivision = '';
    this.selectedCategory = '';
    this.deweyDivisions = [];
    this.deweyCategories = [];
  }

  _isFormValid() {
    const form = this.shadowRoot?.querySelector('.book-form');
    return Boolean(form && form.checkValidity());
  }

  _getPublisher() {
    const publisher = this.book?.publishers?.[0];
    if (!publisher) return '';
    // Handle both OpenLibrary format ({ name: "..." }) and string format
    return typeof publisher === 'object' ? publisher.name || '' : publisher;
  }

  _handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const bookData = Object.fromEntries(formData.entries());

    // If book came from OpenLibrary with both ISBNs, preserve both
    // The form might only show one, but we want to send both to the backend
    if (this.book?.identifiers) {
      if (this.book.identifiers.isbn_10 && !bookData.isbn10) {
        [bookData.isbn10] = this.book.identifiers.isbn_10;
      }
      if (this.book.identifiers.isbn_13 && !bookData.isbn13) {
        [bookData.isbn13] = this.book.identifiers.isbn_13;
      }
    }

    // Include book ID for updates
    if (this.mode === 'update' && this.book?.id) {
      bookData.id = this.book.id;
    }

    // Get cover from cover-upload component
    const coverUpload = this.shadowRoot.getElementById('cover-upload');
    const cover = coverUpload ? coverUpload.getCover() : null;
    const coverChanged = coverUpload ? coverUpload.hasNewCover() : false;

    this.dispatchEvent(
      new CustomEvent('book-submit', {
        detail: { bookData, cover, coverChanged, mode: this.mode },
      }),
    );
  }

  /**
   * Public method to reset the form
   */
  reset() {
    const form = this.shadowRoot?.querySelector('.book-form');
    if (form) {
      form.reset();
    }
    const coverUpload = this.shadowRoot.getElementById('cover-upload');
    if (coverUpload) {
      coverUpload.reset();
    }
    this.book = null;
    this.isFiction = null;
    this._resetDeweySelection();
  }
}

customElements.define('book-form-bks', BookFormBks);
