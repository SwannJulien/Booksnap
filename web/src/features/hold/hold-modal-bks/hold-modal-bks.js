import { LitElement, html } from 'lit';
import { holdModalBksStyles } from './hold-modal-bks-styles.js';
import { searchUsers } from '../../../api/user.js';
import { createHold } from '../../../api/hold.js';
import '../../../components/modal-bks/modal-bks.js';
import '../../../components/button-bks/button-bks.js';

const MIN_QUERY_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 300;

export class HoldModalBks extends LitElement {
  static styles = [holdModalBksStyles];

  static properties = {
    open: { type: Boolean, reflect: true },
    bookId: { type: Number },
    bookTitle: { type: String },
    copyId: { type: Number },
    libraryName: { type: String },
    _step: { type: String, state: true },
    _query: { type: String, state: true },
    _students: { type: Array, state: true },
    _selectedStudent: { type: Object, state: true },
    _queuePosition: { type: Number, state: true },
    _error: { type: String, state: true },
  };

  constructor() {
    super();
    this.open = false;
    this.bookId = null;
    this.bookTitle = '';
    this.copyId = null;
    this.libraryName = '';
    this._debounceTimer = null;
    this._resetState();
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('open') && this.open) {
      this._resetState();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
  }

  _resetState() {
    this._step = 'search';
    this._query = '';
    this._students = null;
    this._selectedStudent = null;
    this._queuePosition = null;
    this._error = '';
  }

  render() {
    return html`
      <modal-bks ?open=${this.open} @modal-close=${this._handleClose}>
        ${this._stepTpl}
      </modal-bks>
    `;
  }

  get _stepTpl() {
    switch (this._step) {
      case 'confirm':
        return this._confirmTpl;
      case 'success':
        return this._successTpl;
      default:
        return this._searchTpl;
    }
  }

  get _searchTpl() {
    return html`
      <div class="hold-modal-content">
        <h2>
          Place a hold on
          <span class="book-title-highlight">${this.bookTitle}</span>
        </h2>
        <p class="hold-hint">Find the student to queue for this book.</p>
        <input
          name="student-search"
          type="search"
          placeholder="Search a student by name, surname or email..."
          .value=${this._query}
          @input=${this._handleSearchInput}
        />
        ${this._studentsTableTpl}
      </div>
    `;
  }

  get _studentsTableTpl() {
    if (this._students === null) return '';
    if (!this._students.length) {
      return html`<p class="no-results">No student found</p>`;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Surname</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          ${this._students.map(
            student => html`
              <tr
                tabindex="0"
                @click=${() => this._selectStudent(student)}
                @keydown=${e => {
                  if (e.key === 'Enter') this._selectStudent(student);
                }}
              >
                <td>${student.firstName}</td>
                <td>${student.lastName}</td>
                <td>${student.email}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  get _confirmTpl() {
    const student = this._selectedStudent;
    return html`
      <div class="hold-modal-content">
        <h2>
          Do you want to place a hold on
          <span class="book-title-highlight">${this.bookTitle}</span>
          for ${student?.firstName} ${student?.lastName}?
        </h2>
        ${this._error ? html`<p class="error">${this._error}</p>` : ''}
        <div class="button-container">
          <button-bks
            label="Yes"
            @button-click=${this._handleConfirmYes}
          ></button-bks>
          <button-bks
            variant="secondary"
            label="No"
            @button-click=${this._handleConfirmNo}
          ></button-bks>
        </div>
      </div>
    `;
  }

  get _successTpl() {
    const student = this._selectedStudent;
    return html`
      <div class="hold-modal-content">
        <h2>
          <span class="book-title-highlight">${this.bookTitle}</span>
          has been reserved for ${student?.firstName} ${student?.lastName}.
        </h2>
        <p class="hold-detail">${this._queuePositionLabel}</p>
        <div class="button-container">
          <button-bks
            label="Close"
            @button-click=${this._handleClose}
          ></button-bks>
        </div>
      </div>
    `;
  }

  get _queuePositionLabel() {
    if (!this._queuePosition) return '';
    if (this._queuePosition === 1) {
      return 'They are next in line for a returned copy.';
    }
    return `They are number ${this._queuePosition} in the queue.`;
  }

  _handleSearchInput(e) {
    this._query = e.target.value;

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    if (this._query.length < MIN_QUERY_LENGTH) {
      this._students = null;
      return;
    }

    this._debounceTimer = setTimeout(
      () => this._searchStudents(this._query),
      SEARCH_DEBOUNCE_MS,
    );
  }

  async _searchStudents(query) {
    try {
      this._students = await searchUsers(query);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Student search failed:', err);
      this._students = [];
    }
  }

  _selectStudent(student) {
    this._selectedStudent = student;
    this._error = '';
    this._step = 'confirm';
  }

  _handleConfirmNo() {
    this._selectedStudent = null;
    this._error = '';
    this._step = 'search';
  }

  async _handleConfirmYes() {
    try {
      const hold = await createHold(this.copyId, this._selectedStudent.id);
      this._queuePosition = hold?.queuePosition ?? null;
      this._step = 'success';
      this.dispatchEvent(
        new CustomEvent('hold-created', {
          detail: { bookId: this.bookId, student: this._selectedStudent },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      if (err.reason === 'copy_available') {
        this._error = `A copy of this book is available at ${this.libraryName}: borrow it instead.`;
        return;
      }

      // Nothing to retry: this student is already queued for this book
      if (err.reason === 'duplicate_hold') {
        this._error = 'This student already has an active hold on this book.';
        return;
      }

      // eslint-disable-next-line no-console
      console.error('Failed to create hold:', err);
      this._error = err.message;
    }
  }

  _handleClose() {
    this.dispatchEvent(
      new CustomEvent('modal-close', { bubbles: true, composed: true }),
    );
  }
}

customElements.define('hold-modal-bks', HoldModalBks);
