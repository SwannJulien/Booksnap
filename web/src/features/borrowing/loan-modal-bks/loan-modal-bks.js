import { LitElement, html } from 'lit';
import { loanModalBksStyles } from './loan-modal-bks-styles.js';
import { searchUsers } from '../../../api/user.js';
import { createBorrowing } from '../../../api/borrowing.js';
import { formatDate } from '../../../utils/dateFormatter.js';
import '../../../components/modal-bks/modal-bks.js';
import '../../../components/button-bks/button-bks.js';

const MIN_QUERY_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 300;

export class LoanModalBks extends LitElement {
  static styles = [loanModalBksStyles];

  static properties = {
    open: { type: Boolean, reflect: true },
    copyId: { type: String },
    bookTitle: { type: String },
    // Set by the caller when the copy is already known to be unavailable, so the
    // modal opens straight on the explanation instead of offering a loan
    unavailable: { type: Boolean },
    copyStatus: { type: String },
    // The student this copy is being kept for, when it is on hold. Present means the
    // modal skips the search: only they may collect it, and the loan fulfils the hold.
    hold: { type: Object },
    _step: { type: String, state: true },
    _query: { type: String, state: true },
    _students: { type: Array, state: true },
    _selectedStudent: { type: Object, state: true },
    _error: { type: String, state: true },
    // True when this modal itself hit the 409, as opposed to being opened on an
    // already-unavailable copy. Kept out of copyStatus, which the parent owns.
    _conflict: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.open = false;
    this.copyId = null;
    this.bookTitle = '';
    this.unavailable = false;
    this.copyStatus = '';
    this.hold = null;
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
    if (this.hold) {
      this._step = 'pickup';
    } else {
      this._step = this.unavailable ? 'unavailable' : 'offer';
    }
    this._query = '';
    this._students = null;
    // A hold names its student, and nobody else can be handed the copy, so it stands
    // in for the search selection
    this._selectedStudent = this.hold
      ? {
          id: this.hold.userId,
          firstName: this.hold.firstName,
          lastName: this.hold.lastName,
        }
      : null;
    this._error = '';
    this._conflict = false;
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
      case 'pickup':
        return this._pickupTpl;
      case 'search':
        return this._searchTpl;
      case 'confirm':
        return this._confirmTpl;
      case 'success':
        return this._successTpl;
      case 'unavailable':
        return this._unavailableTpl;
      default:
        return this._offerTpl;
    }
  }

  get _offerTpl() {
    return html`
      <div class="loan-modal-content">
        <h2>
          <span class="book-title-highlight">${this.bookTitle}</span>
          is currently available.
        </h2>
        <h2>Do you want to make a loan?</h2>
        <div class="button-container">
          <button-bks
            label="Yes"
            @button-click=${this._handleOfferYes}
          ></button-bks>
          <button-bks
            variant="secondary"
            label="No"
            @button-click=${this._handleClose}
          ></button-bks>
        </div>
      </div>
    `;
  }

  // The copy was set aside for one student: confirming the handover turns their hold
  // into the loan, so there is nobody to search for.
  get _pickupTpl() {
    const { firstName, lastName } = this.hold ?? {};

    return html`
      <div class="loan-modal-content">
        <h2>
          <span class="book-title-highlight">${this.bookTitle}</span>
          is on hold for ${firstName} ${lastName}.
        </h2>
        ${
          this.hold?.endDate
            ? html`<p class="pickup-detail">
                To be collected by ${formatDate(this.hold.endDate)}.
              </p>`
            : ''
        }
        <h2>Hand it over now?</h2>
        ${this._error ? html`<p class="error">${this._error}</p>` : ''}
        <div class="button-container">
          <button-bks
            label="Yes"
            @button-click=${this._handleConfirmYes}
          ></button-bks>
          <button-bks
            variant="secondary"
            label="No"
            @button-click=${this._handleClose}
          ></button-bks>
        </div>
      </div>
    `;
  }

  get _searchTpl() {
    return html`
      <div class="loan-modal-content">
        <h2>Find a student by its name, surname or email</h2>
        <input
          name="student-search"
          type="search"
          placeholder="Search a student..."
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
      <div class="loan-modal-content">
        <h2>
          Do you want to assign
          <span class="book-title-highlight">${this.bookTitle}</span>
          to ${student?.firstName} ${student?.lastName}?
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
      <div class="loan-modal-content">
        <h2>
          <span class="book-title-highlight">${this.bookTitle}</span>
          has been assigned to ${student?.firstName} ${student?.lastName}.
        </h2>
        <div class="button-container">
          <button-bks
            label="Close"
            @button-click=${this._handleClose}
          ></button-bks>
        </div>
      </div>
    `;
  }

  get _unavailableTpl() {
    return html`
      <div class="loan-modal-content">
        <h2>
          <span class="book-title-highlight">${this.bookTitle}</span>
          is no longer available.
        </h2>
        <p class="unavailable-detail">${this._unavailableReason}</p>
        <div class="button-container">
          <button-bks
            variant="secondary"
            label="Close"
            @button-click=${this._handleClose}
          ></button-bks>
        </div>
      </div>
    `;
  }

  get _unavailableReason() {
    // The handover was refused: the hold is gone, since the student it named is the
    // one person the server would have accepted
    if (this._conflict && this.hold) {
      return `This copy is no longer held for ${this.hold.firstName} ${this.hold.lastName}. The pickup window may have passed, or the hold was collected already.`;
    }

    const status = this._conflict ? 'borrowed' : this.copyStatus?.toLowerCase();

    if (!status || status === 'borrowed') {
      return 'Someone else borrowed this copy a moment ago.';
    }

    const readable = status.replace(/_/g, ' ');
    return `This copy is now marked as "${readable}" and cannot be lent.`;
  }

  _handleOfferYes() {
    this._step = 'search';
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
      await createBorrowing(Number(this.copyId), this._selectedStudent.id);
      this._step = 'success';
      this.dispatchEvent(
        new CustomEvent('loan-created', {
          detail: { copyId: this.copyId, student: this._selectedStudent },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      // The copy was taken between the availability check and this confirmation:
      // there is nothing to retry, so explain it and let the caller refresh.
      if (err.status === 409) {
        this._conflict = true;
        this._step = 'unavailable';
        this.dispatchEvent(
          new CustomEvent('copy-unavailable', {
            detail: { copyId: this.copyId },
            bubbles: true,
            composed: true,
          }),
        );
        return;
      }

      // eslint-disable-next-line no-console
      console.error('Failed to create borrowing:', err);
      this._error = err.message;
    }
  }

  _handleClose() {
    this.dispatchEvent(
      new CustomEvent('modal-close', { bubbles: true, composed: true }),
    );
  }
}

customElements.define('loan-modal-bks', LoanModalBks);
