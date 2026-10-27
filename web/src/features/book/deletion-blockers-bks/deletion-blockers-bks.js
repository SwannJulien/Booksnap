import { LitElement, html, nothing } from 'lit';
import { deletionBlockersBksStyles } from './deletion-blockers-bks-styles.js';
import { formatDate } from '../../../utils/dateFormatter.js';
import { formatStatus } from '../../../utils/statusFormatter.js';

export class DeletionBlockersBks extends LitElement {
  static styles = [deletionBlockersBksStyles];

  static properties = {
    activeBorrowings: { type: Array },
    activeHolds: { type: Array },
  };

  constructor() {
    super();
    this.activeBorrowings = [];
    this.activeHolds = [];
  }

  render() {
    return html`
      <div class="blockers" role="alert">
        ${this._borrowingsTpl} ${this._holdsTpl}
      </div>
    `;
  }

  get _borrowingsTpl() {
    if (!this.activeBorrowings.length) return nothing;
    return html`
      <section>
        <h3>Borrowed</h3>
        <ul>
          ${this.activeBorrowings.map(
            borrowing => html`
              <li>
                <span class="student"
                  >${borrowing.firstName} ${borrowing.lastName}</span
                >
                <span class="detail">${borrowing.copyIdentificationCode}</span>
                <span class="status ${borrowing.status}"
                  >${formatStatus(borrowing.status)}</span
                >
                <span class="detail"
                  >${formatDate(borrowing.startDate)} →
                  ${formatDate(borrowing.endDate)}</span
                >
              </li>
            `,
          )}
        </ul>
      </section>
    `;
  }

  get _holdsTpl() {
    if (!this.activeHolds.length) return nothing;
    return html`
      <section>
        <h3>Holds</h3>
        <ul>
          ${this.activeHolds.map(
            hold => html`
              <li>
                <span class="student">${hold.firstName} ${hold.lastName}</span>
                <span class="detail"
                  >${hold.copyIdentificationCode ?? '—'}</span
                >
                <span class="status ${hold.status}"
                  >${formatStatus(hold.status)}</span
                >
                <span class="detail"
                  >${formatDate(hold.createdDate)}${hold.endDate
                    ? html` → ${formatDate(hold.endDate)}`
                    : nothing}</span
                >
              </li>
            `,
          )}
        </ul>
      </section>
    `;
  }
}

customElements.define('deletion-blockers-bks', DeletionBlockersBks);
