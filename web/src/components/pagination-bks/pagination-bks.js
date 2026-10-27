import { LitElement, html } from 'lit';
import { paginationBksStyles } from './pagination-bks-styles.js';
import '../button-bks/button-bks.js';

export class PaginationBks extends LitElement {
  static styles = [paginationBksStyles];

  static properties = {
    pageInfo: { type: Object },
  };

  constructor() {
    super();
    this.pageInfo = { page: 1, size: 10, totalElements: 0 };
  }

  render() {
    const { page, size, totalElements } = this.pageInfo;
    const start = (page - 1) * size + 1;
    const end = Math.min(page * size, totalElements);

    return html`
      <span>Showing ${start} to ${end} of ${totalElements} results</span>
      <div class="buttons">
        <button-bks
          label="Previous"
          variant="secondary"
          ?disabled=${page === 1}
          @click=${this._handlePrevious}
        ></button-bks>
        <button-bks
          label="Next"
          variant="secondary"
          ?disabled=${page >= Math.ceil(totalElements / size)}
          @click=${this._handleNext}
        ></button-bks>
      </div>
    `;
  }

  _handlePrevious() {
    this.dispatchEvent(
      new CustomEvent('page-previous', { bubbles: true, composed: true }),
    );
  }

  _handleNext() {
    this.dispatchEvent(
      new CustomEvent('page-next', { bubbles: true, composed: true }),
    );
  }
}

customElements.define('pagination-bks', PaginationBks);
