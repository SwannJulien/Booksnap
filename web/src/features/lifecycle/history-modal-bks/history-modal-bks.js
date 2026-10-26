import { LitElement, html, nothing } from 'lit';
import { historyModalBksStyles } from './history-modal-bks-styles.js';
import { getBookHistory, getCopyHistory } from '../../../api/lifecycle.js';
import {
  formatEventDate,
  formatEventLabel,
} from '../../../utils/lifecycleEventFormatter.js';
import '../../../components/modal-bks/modal-bks.js';
import '../../../components/button-bks/button-bks.js';
import '../../../components/spinner-bks/spinner-bks.js';

const LOAD_ERROR = 'Could not load the history.';

function titleOf(target) {
  if (target.kind === 'copy') {
    return `History of copy ${target.identificationCode} — "${target.title}"`;
  }
  return `History of "${target.title}"`;
}

function renderEventRow(event) {
  return html`
    <tr>
      <td>${formatEventDate(event)}</td>
      <td>${formatEventLabel(event)}</td>
      <td>${event.copy?.identificationCode ?? ''}</td>
      <td>${event.actor}</td>
    </tr>
  `;
}

export class HistoryModalBks extends LitElement {
  static styles = [historyModalBksStyles];

  static properties = {
    open: { type: Boolean, reflect: true },
    target: { type: Object },
    _events: { type: Array, state: true },
    _totalElements: { type: Number, state: true },
    _page: { type: Number, state: true },
    _loading: { type: Boolean, state: true },
    _loadingMore: { type: Boolean, state: true },
    _error: { type: Boolean, state: true },
    _moreError: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.open = false;
    this.target = null;
    this._reset();
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('open') || changedProperties.has('target')) {
      this._reset();
      this._loading = this.open && !!this.target;
    }
  }

  updated(changedProperties) {
    const opened =
      changedProperties.has('open') || changedProperties.has('target');
    if (opened && this._loading) {
      this._loadFirstPage();
    }
  }

  render() {
    return html`
      <modal-bks ?open=${this.open} @modal-close=${this._handleClose}>
        <div class="history-content">
          ${this.target ? html`<h2>${titleOf(this.target)}</h2>` : nothing}
          ${this._bodyTpl}
        </div>
      </modal-bks>
    `;
  }

  get _bodyTpl() {
    if (this._loading) {
      return html`<spinner-bks></spinner-bks>`;
    }
    if (this._error) {
      return html`<p role="alert">${LOAD_ERROR}</p>`;
    }
    if (this._events.length === 0) {
      return this.open ? html`<p>No events recorded.</p>` : nothing;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Event</th>
            <th>Copy</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          ${this._events.map(renderEventRow)}
        </tbody>
      </table>
      ${this._loadingMore ? html`<spinner-bks></spinner-bks>` : nothing}
      ${this._moreError ? html`<p role="alert">${LOAD_ERROR}</p>` : nothing}
      ${this._hasMore
        ? html`<button-bks
            label="Load more"
            variant="secondary"
            @click=${this._loadMore}
          ></button-bks>`
        : nothing}
    `;
  }

  get _hasMore() {
    return !this._loadingMore && this._events.length < this._totalElements;
  }

  _reset() {
    this._request = {};
    this._events = [];
    this._totalElements = 0;
    this._page = 1;
    this._loading = false;
    this._loadingMore = false;
    this._error = false;
    this._moreError = false;
  }

  _fetchPage(page) {
    const { kind, id } = this.target;
    return kind === 'copy'
      ? getCopyHistory(id, page)
      : getBookHistory(id, page);
  }

  async _loadFirstPage() {
    const request = this._request;

    try {
      const response = await this._fetchPage(1);
      if (request !== this._request) return;
      this._events = response.data;
      this._totalElements = response.page.totalElements;
    } catch {
      if (request !== this._request) return;
      this._error = true;
    }
    this._loading = false;
  }

  async _loadMore() {
    const request = this._request;
    this._loadingMore = true;
    this._moreError = false;

    try {
      const response = await this._fetchPage(this._page + 1);
      if (request !== this._request) return;
      this._events = [...this._events, ...response.data];
      this._page += 1;
      this._totalElements = response.page.totalElements;
    } catch {
      if (request !== this._request) return;
      this._moreError = true;
    }
    this._loadingMore = false;
  }

  _handleClose() {
    this.dispatchEvent(
      new CustomEvent('modal-close', { bubbles: true, composed: true }),
    );
  }
}

customElements.define('history-modal-bks', HistoryModalBks);
