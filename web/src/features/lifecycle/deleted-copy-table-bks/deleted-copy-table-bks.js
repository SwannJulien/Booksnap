import { LitElement, html } from 'lit';
import { deletedCopyTableBksStyles } from './deleted-copy-table-bks-styles.js';
import { formatDateTime } from '../../../utils/dateFormatter.js';
import '../../../components/button-bks/button-bks.js';
import '../../../components/pagination-bks/pagination-bks.js';

export class DeletedCopyTableBks extends LitElement {
  static styles = [deletedCopyTableBksStyles];

  static properties = {
    rows: { type: Array },
    pageInfo: { type: Object },
  };

  constructor() {
    super();
    this.rows = [];
    this.pageInfo = { page: 1, size: 10, totalElements: 0 };
  }

  render() {
    if (this.rows.length === 0) {
      return html`<p>No deleted copies.</p>`;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Book</th>
            <th>Deleted on</th>
            <th>Deleted by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this.rows.map(
            copy => html`
              <tr>
                <td>${copy.identificationCode}</td>
                <td>${copy.bookTitle}</td>
                <td>${formatDateTime(copy.deletedAt)}</td>
                <td>${copy.deletedBy ?? ''}</td>
                <td>
                  <button-bks
                    label="History"
                    variant="secondary"
                    @click=${() => this._requestHistory(copy)}
                  ></button-bks>
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
      <pagination-bks .pageInfo=${this.pageInfo}></pagination-bks>
    `;
  }

  _requestHistory({ id, bookTitle, identificationCode }) {
    this.dispatchEvent(
      new CustomEvent('history-requested', {
        detail: { kind: 'copy', id, title: bookTitle, identificationCode },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define('deleted-copy-table-bks', DeletedCopyTableBks);
