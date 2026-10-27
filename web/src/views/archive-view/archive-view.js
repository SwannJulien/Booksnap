import { LitElement, html } from 'lit';
import { Task, TaskStatus } from '@lit/task';
import { archiveView } from './archive-view-styles.js';
import { getDeletedBooks, getDeletedCopies } from '../../api/lifecycle.js';
import '../../components/spinner-bks/spinner-bks.js';
import '../../features/lifecycle/deleted-book-table-bks/deleted-book-table-bks.js';
import '../../features/lifecycle/deleted-copy-table-bks/deleted-copy-table-bks.js';
import '../../features/lifecycle/history-modal-bks/history-modal-bks.js';

const isForbidden = task =>
  task.status === TaskStatus.ERROR && task.error?.status === 403;

export class ArchiveView extends LitElement {
  static styles = [archiveView];

  static properties = {
    deletedBooksPage: { type: Number, state: true },
    deletedCopiesPage: { type: Number, state: true },
    historyTarget: { type: Object, state: true },
  };

  constructor() {
    super();
    this.deletedBooksPage = 1;
    this.deletedCopiesPage = 1;
    this.historyTarget = null;
  }

  deletedBooksTask = new Task(this, {
    task: ([page]) => getDeletedBooks(page),
    args: () => [this.deletedBooksPage],
  });

  deletedCopiesTask = new Task(this, {
    task: ([page]) => getDeletedCopies(page),
    args: () => [this.deletedCopiesPage],
  });

  render() {
    if (
      isForbidden(this.deletedBooksTask) ||
      isForbidden(this.deletedCopiesTask)
    ) {
      return html`<p role="alert">
        Only librarians and administrators can see the archive.
      </p>`;
    }

    return html`
      <h1>Archive</h1>
      <section aria-labelledby="deleted-books-title">
        <h2 id="deleted-books-title">Deleted books</h2>
        ${this.deletedBooksTask.render({
          pending: () => html`<spinner-bks></spinner-bks>`,
          complete: books => html`
            <deleted-book-table-bks
              .rows=${books.data}
              .pageInfo=${books.page}
              @page-previous=${() => this._changePage('deletedBooksPage', -1)}
              @page-next=${() => this._changePage('deletedBooksPage', 1)}
              @history-requested=${this._handleHistoryRequested}
            ></deleted-book-table-bks>
          `,
          error: () => html`<p role="alert">Could not load deleted books.</p>`,
        })}
      </section>
      <section aria-labelledby="deleted-copies-title">
        <h2 id="deleted-copies-title">Deleted copies</h2>
        ${this.deletedCopiesTask.render({
          pending: () => html`<spinner-bks></spinner-bks>`,
          complete: copies => html`
            <deleted-copy-table-bks
              .rows=${copies.data}
              .pageInfo=${copies.page}
              @page-previous=${() => this._changePage('deletedCopiesPage', -1)}
              @page-next=${() => this._changePage('deletedCopiesPage', 1)}
              @history-requested=${this._handleHistoryRequested}
            ></deleted-copy-table-bks>
          `,
          error: () => html`<p role="alert">Could not load deleted copies.</p>`,
        })}
      </section>
      <history-modal-bks
        ?open=${!!this.historyTarget}
        .target=${this.historyTarget}
        @modal-close=${this._handleHistoryClose}
      ></history-modal-bks>
    `;
  }

  _changePage(pageProperty, delta) {
    this[pageProperty] = Math.max(1, this[pageProperty] + delta);
  }

  _handleHistoryRequested(e) {
    this.historyTarget = e.detail;
  }

  _handleHistoryClose() {
    this.historyTarget = null;
  }
}

customElements.define('archive-view', ArchiveView);
