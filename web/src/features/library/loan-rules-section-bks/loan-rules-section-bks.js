import { LitElement, html, nothing } from 'lit';
import { Task } from '@lit/task';
import { loanRulesSectionBksStyles } from './loan-rules-section-bks-styles.js';
import { getLoanRules, updateLoanRules } from '../../../api/library.js';
import '../../../components/button-bks/button-bks.js';
import '../../../components/spinner-bks/spinner-bks.js';

const RANGE_ERROR = 'Enter a whole number of days between 1 and 365.';
const MIN_DAYS = 1;
const MAX_DAYS = 365;

const formatDays = count => `${count} ${count === 1 ? 'day' : 'days'}`;

function parseDays(text) {
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const days = Number(text);
  return days >= MIN_DAYS && days <= MAX_DAYS ? days : null;
}

export class LoanRulesSectionBks extends LitElement {
  static styles = loanRulesSectionBksStyles;

  static properties = {
    editable: { type: Boolean },
    _editingId: { state: true },
    _error: { state: true },
    _saving: { state: true },
  };

  loanRulesTask = new Task(this, {
    task: () => getLoanRules(),
    args: () => [],
  });

  constructor() {
    super();
    this.editable = false;
    this._editingId = null;
    this._error = '';
    this._saving = false;
  }

  reload() {
    this.loanRulesTask.run();
  }

  render() {
    return html`
      <section aria-labelledby="loan-rules-title">
        <h2 id="loan-rules-title">Loan rules</h2>
        <p class="subtitle">
          How long each library lends a copy and keeps one aside for a hold.
        </p>
        ${this.loanRulesTask.render({
          pending: () => html`<spinner-bks></spinner-bks>`,
          complete: libraries =>
            libraries.length === 0
              ? html`<p>No library yet.</p>`
              : html`<ul>
                  ${libraries.map(library => this._renderLibrary(library))}
                </ul>`,
          error: () =>
            html`<p role="alert">The loan rules could not be loaded.</p>`,
        })}
      </section>
    `;
  }

  _renderLibrary(library) {
    if (library.id === this._editingId) {
      return this._renderForm(library);
    }
    return html`<li>
      <span class="library-name">${library.name}</span>
      <span class="rules">
        Loan ${formatDays(library.borrowingDurationDays)} · Pickup
        ${formatDays(library.pickupWindowDays)}
      </span>
      ${this.editable
        ? html`<button-bks
            icon="edit"
            icon-only
            label="Edit loan rules"
            @click=${() => this._openForm(library)}
          ></button-bks>`
        : nothing}
    </li>`;
  }

  _renderForm(library) {
    return html`<li>
      <form @submit=${event => this._handleSave(event, library)} novalidate>
        <span class="library-name">${library.name}</span>
        <label for="borrowing-days">Loan</label>
        <input
          id="borrowing-days"
          name="borrowingDays"
          type="number"
          min=${MIN_DAYS}
          max=${MAX_DAYS}
          step="1"
          .value=${String(library.borrowingDurationDays)}
        />
        <span>days</span>
        <label for="pickup-days">Pickup</label>
        <input
          id="pickup-days"
          name="pickupDays"
          type="number"
          min=${MIN_DAYS}
          max=${MAX_DAYS}
          step="1"
          .value=${String(library.pickupWindowDays)}
        />
        <span>days</span>
        <button-bks
          type="submit"
          label="Save"
          compact
          ?disabled=${this._saving}
        ></button-bks>
        <button-bks
          label="Cancel"
          compact
          variant="secondary"
          @click=${this._closeForm}
        ></button-bks>
        ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
      </form>
    </li>`;
  }

  _openForm(library) {
    this._editingId = library.id;
    this._error = '';
  }

  _closeForm() {
    this._editingId = null;
    this._error = '';
  }

  async _handleSave(event, library) {
    event.preventDefault();
    const { borrowingDays, pickupDays } = event.target.elements;
    const borrowing = parseDays(borrowingDays.value);
    const pickup = parseDays(pickupDays.value);
    if (borrowing === null || pickup === null) {
      this._error = RANGE_ERROR;
      return;
    }

    this._saving = true;
    try {
      await updateLoanRules(library.id, borrowing, pickup);
      this._closeForm();
      this.reload();
    } catch (error) {
      this._error =
        error.status === 400
          ? RANGE_ERROR
          : 'The loan rules could not be saved.';
    } finally {
      this._saving = false;
    }
  }
}

customElements.define('loan-rules-section-bks', LoanRulesSectionBks);
