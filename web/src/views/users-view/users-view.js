import { LitElement, html, nothing } from 'lit';
import { Task } from '@lit/task';
import { usersView } from './users-view-styles.js';
import { sharedStyles } from '../../shared-styles.js';
import { getUsers } from '../../api/user.js';
import '../../components/spinner-bks/spinner-bks.js';
import '../../components/pagination-bks/pagination-bks.js';
import '../../components/button-bks/button-bks.js';
import '../../components/dropdown-bks/dropdown-bks.js';
import '../../features/user/account-modal-bks/account-modal-bks.js';

const SEARCH_DEBOUNCE_MS = 300;

const MORE_ACTIONS_ICON_PATH =
  'M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z';
const EDIT_ICON_PATH =
  'M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z';

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
    _creating: { type: Boolean, state: true },
    _editing: { type: Object, state: true },
    _openActionMenuId: { state: true },
  };

  constructor() {
    super();
    this.page = 1;
    this._query = '';
    this._committedQuery = '';
    this._role = '';
    this._status = 'active';
    this._creating = false;
    this._editing = null;
    this._openActionMenuId = null;
    this._debounceTimer = null;
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleOutsideClick);
    clearTimeout(this._debounceTimer);
  }

  listTask = new Task(this, {
    task: ([page, q, role, status]) => getUsers({ page, q, role, status }),
    args: () => [this.page, this._committedQuery, this._role, this._status],
  });

  render() {
    return html`
      <div class="header">
        <div>
          <h1>Users</h1>
          <p class="subtitle">
            Every student and staff member who has an account.
          </p>
        </div>
        <button-bks
          label="New account"
          @button-click=${() => {
            this._creating = true;
          }}
        ></button-bks>
      </div>
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
      <account-modal-bks
        .account=${this._editing}
        ?open=${this._creating || !!this._editing}
        @modal-close=${() => {
          this._creating = false;
          this._editing = null;
        }}
        @account-created=${() => this.listTask.run()}
        @account-updated=${() => this.listTask.run()}
      ></account-modal-bks>
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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.data.map(user => this._rowTpl(user))}
        </tbody>
      </table>
      <pagination-bks
        .pageInfo=${users.page}
        @page-previous=${this._handlePrevious}
        @page-next=${this._handleNext}
      ></pagination-bks>
    `;
  }

  _rowTpl(user) {
    const isMenuOpen = this._openActionMenuId === user.id;
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
        <td>
          <div class="action-menu-wrapper">
            <button
              class="action-btn ${isMenuOpen ? 'active' : ''}"
              aria-label="More actions"
              @click=${() => this._handleToggleActionMenu(user.id)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
                <path d=${MORE_ACTIONS_ICON_PATH} />
              </svg>
            </button>
            ${isMenuOpen
              ? html`
                  <dropdown-bks
                    .options=${[
                      {
                        action: 'edit',
                        data: user,
                        path: EDIT_ICON_PATH,
                        label: 'Edit',
                      },
                    ]}
                    @dropdown-selected-option=${this._handleDropdownAction}
                  ></dropdown-bks>
                `
              : nothing}
          </div>
        </td>
      </tr>
    `;
  }

  _handleToggleActionMenu(userId) {
    this._openActionMenuId = this._openActionMenuId === userId ? null : userId;
  }

  _handleOutsideClick(e) {
    if (!this._openActionMenuId) return;
    const clickedOnMenu = e
      .composedPath()
      .some(
        el =>
          el.classList?.contains('action-dropdown') ||
          el.classList?.contains('action-btn'),
      );
    if (!clickedOnMenu) {
      this._openActionMenuId = null;
    }
  }

  _handleDropdownAction(e) {
    const { action, data } = e.detail;
    this._openActionMenuId = null;

    switch (action) {
      case 'edit':
        this._editing = data;
        break;
      default:
        break;
    }
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
