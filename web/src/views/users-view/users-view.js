import { LitElement, html } from 'lit';
import { Task } from '@lit/task';
import { usersView } from './users-view-styles.js';
import { sharedStyles } from '../../shared-styles.js';
import { getUsers } from '../../api/user.js';
import '../../components/spinner-bks/spinner-bks.js';
import '../../components/pagination-bks/pagination-bks.js';

const SEARCH_DEBOUNCE_MS = 300;

const ROLE_LABELS = {
  user: 'Student',
  librarian: 'Librarian',
  admin: 'Admin',
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'all', label: 'All statuses' },
];

export class UsersView extends LitElement {
  static styles = [sharedStyles, usersView];

  static properties = {
    page: { type: Number, state: true },
    _query: { type: String, state: true },
    _committedQuery: { type: String, state: true },
    _role: { type: String, state: true },
    _status: { type: String, state: true },
  };

  constructor() {
    super();
    this.page = 1;
    this._query = '';
    this._committedQuery = '';
    this._role = '';
    this._status = 'active';
    this._debounceTimer = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._debounceTimer);
  }

  listTask = new Task(this, {
    task: ([page, q, role, status]) => getUsers({ page, q, role, status }),
    args: () => [this.page, this._committedQuery, this._role, this._status],
  });

  render() {
    return html`
      <h1>Users</h1>
      <p class="subtitle">Every student and staff member who has an account.</p>
      <div class="toolbar">
        <input
          name="search"
          type="search"
          aria-label="Search by name or email"
          placeholder="Search by name or email"
          .value=${this._query}
          @input=${this._handleSearchInput}
        />
        <select
          name="role"
          aria-label="Role"
          .value=${this._role}
          @change=${this._handleRoleChange}
        >
          <option value="">All roles</option>
          ${Object.entries(ROLE_LABELS).map(
            ([value, label]) => html`<option value=${value}>${label}</option>`,
          )}
        </select>
        <select
          name="status"
          aria-label="Status"
          .value=${this._status}
          @change=${this._handleStatusChange}
        >
          ${STATUS_OPTIONS.map(
            ({ value, label }) =>
              html`<option value=${value}>${label}</option>`,
          )}
        </select>
      </div>
      ${this.listTask.render({
        pending: () => html`<spinner-bks></spinner-bks>`,
        complete: users => this._listTpl(users),
        error: () =>
          html`<p role="alert">The accounts could not be loaded.</p>`,
      })}
    `;
  }

  _listTpl(users) {
    if (!users.data.length) {
      return html`<p class="empty-state">No account matches your search.</p>`;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${users.data.map(user => UsersView._rowTpl(user))}
        </tbody>
      </table>
      <pagination-bks
        .pageInfo=${users.page}
        @page-previous=${this._handlePrevious}
        @page-next=${this._handleNext}
      ></pagination-bks>
    `;
  }

  static _rowTpl(user) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');

    return html`
      <tr>
        <td>${name || '—'}</td>
        <td>${user.email}</td>
        <td>${ROLE_LABELS[user.role]}</td>
        <td>
          <span class="status-pill ${user.active ? 'active' : 'deactivated'}">
            ${user.active ? 'Active' : 'Deactivated'}
          </span>
        </td>
      </tr>
    `;
  }

  _handleSearchInput(e) {
    this._query = e.target.value;
    clearTimeout(this._debounceTimer);

    this._debounceTimer = setTimeout(() => {
      const committed = this._query.trim();
      if (committed !== this._committedQuery) {
        this._committedQuery = committed;
        this.page = 1;
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  _handleRoleChange(e) {
    this._role = e.target.value;
    this.page = 1;
  }

  _handleStatusChange(e) {
    this._status = e.target.value;
    this.page = 1;
  }

  _handlePrevious() {
    this.page = Math.max(1, this.page - 1);
  }

  _handleNext() {
    this.page += 1;
  }
}

customElements.define('users-view', UsersView);
