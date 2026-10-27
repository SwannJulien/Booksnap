import { LitElement, html } from 'lit';
import { deletedBookTableBksStyles } from './deleted-book-table-bks-styles.js';
import { formatDateTime } from '../../../utils/dateFormatter.js';
import '../../../components/button-bks/button-bks.js';
import '../../../components/pagination-bks/pagination-bks.js';

export class DeletedBookTableBks extends LitElement {
  static styles = [deletedBookTableBksStyles];

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
      return html`<p>No deleted books.</p>`;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Deleted on</th>
            <th>Deleted by</th>
            <th>Copies deleted with it</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this.rows.map(
            book => html`
              <tr>
                <td>${book.title}</td>
                <td>${formatDateTime(book.deletedAt)}</td>
                <td>${book.deletedBy ?? ''}</td>
                <td>${book.copiesDeletedWithBook}</td>
                <td>
                  <button-bks
                    label="History"
                    variant="secondary"
                    @click=${() => this._requestHistory(book)}
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

  _requestHistory({ id, title }) {
    this.dispatchEvent(
      new CustomEvent('history-requested', {
        detail: { kind: 'book', id, title },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define('deleted-book-table-bks', DeletedBookTableBks);
