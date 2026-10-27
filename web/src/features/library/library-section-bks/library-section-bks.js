import { LitElement, html, nothing } from 'lit';
import { Task } from '@lit/task';
import { librarySectionBksStyles } from './library-section-bks-styles.js';
import {
  createLibrary,
  getLibraries,
  renameLibrary,
} from '../../../api/library.js';
import '../../../components/button-bks/button-bks.js';
import '../../../components/spinner-bks/spinner-bks.js';

export class LibrarySectionBks extends LitElement {
  static styles = librarySectionBksStyles;

  static properties = {
    _adding: { state: true },
    _error: { state: true },
    _submitting: { state: true },
    _renamingId: { state: true },
    _renameDraft: { state: true },
    _renameError: { state: true },
    _renaming: { state: true },
  };

  librariesTask = new Task(this, {
    task: () => getLibraries(),
    args: () => [],
  });

  constructor() {
    super();
    this._adding = false;
    this._error = '';
    this._submitting = false;
    this._renamingId = null;
    this._renameDraft = '';
    this._renameError = '';
    this._renaming = false;
  }

  render() {
    return html`
      <section aria-labelledby="libraries-title">
        <h2 id="libraries-title">Libraries</h2>
        <p class="subtitle">Add the school's libraries and rename them.</p>
        ${this.librariesTask.render({
          pending: () => html`<spinner-bks></spinner-bks>`,
          complete: libraries =>
            libraries.length === 0
              ? html`<p>No library yet.</p>`
              : html`<ul>
                  ${libraries.map(library => this._renderLibrary(library))}
                </ul>`,
          error: () =>
            html`<p role="alert">The libraries could not be loaded.</p>`,
        })}
        ${this._adding ? this._renderForm() : this._renderAddButton()}
      </section>
    `;
  }

  _renderLibrary(library) {
    return library.id === this._renamingId
      ? this._renderRenameForm(library)
      : html`<li>
          <span class="library-name">${library.name}</span>
          <button-bks
            icon="edit"
            icon-only
            label="Rename"
            @click=${() => this._openRename(library)}
          ></button-bks>
        </li>`;
  }

  _renderRenameForm(library) {
    return html`<li>
      <form @submit=${event => this._handleRename(event, library)} novalidate>
        <input
          name="name"
          aria-label="New name"
          maxlength="255"
          .value=${this._renameDraft}
          @input=${event => {
            this._renameDraft = event.target.value;
          }}
        />
        <button-bks
          type="submit"
          label="Save"
          compact
          ?disabled=${this._renaming}
        ></button-bks>
        <button-bks
          label="Cancel"
          compact
          variant="secondary"
          @click=${this._closeRename}
        ></button-bks>
        ${this._renameError
          ? html`<p role="alert">${this._renameError}</p>`
          : nothing}
      </form>
    </li>`;
  }

  _renderAddButton() {
    return html`<button-bks
      label="Add a library"
      @click=${this._openForm}
    ></button-bks>`;
  }

  _renderForm() {
    return html`
      <form @submit=${this._handleCreate} novalidate>
        <label for="library-name">Name</label>
        <input id="library-name" name="name" maxlength="255" />
        <button-bks
          type="submit"
          label="Create"
          compact
          ?disabled=${this._submitting}
        ></button-bks>
        <button-bks
          label="Cancel"
          compact
          variant="secondary"
          @click=${this._closeForm}
        ></button-bks>
        ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
      </form>
    `;
  }

  _announceChange() {
    this.dispatchEvent(
      new CustomEvent('libraries-changed', { bubbles: true, composed: true }),
    );
  }

  _openForm() {
    this._adding = true;
  }

  _closeForm() {
    this._adding = false;
    this._error = '';
  }

  _openRename(library) {
    this._renamingId = library.id;
    this._renameDraft = library.name;
    this._renameError = '';
  }

  _closeRename() {
    this._renamingId = null;
    this._renameError = '';
  }

  async _handleRename(event, library) {
    event.preventDefault();
    const name = this._renameDraft.trim();
    if (!name) {
      this._renameError = 'Enter a name for the library.';
      return;
    }

    this._renaming = true;
    try {
      await renameLibrary(library.id, name);
      this._closeRename();
      this.librariesTask.run();
      this._announceChange();
    } catch (error) {
      this._renameError = error.message;
    } finally {
      this._renaming = false;
    }
  }

  async _handleCreate(event) {
    event.preventDefault();
    const name = event.target.elements.name.value.trim();
    if (!name) {
      this._error = 'Enter a name for the library.';
      return;
    }

    this._submitting = true;
    try {
      await createLibrary(name);
      this._closeForm();
      this.librariesTask.run();
      this._announceChange();
    } catch (error) {
      this._error = error.message;
    } finally {
      this._submitting = false;
    }
  }
}

customElements.define('library-section-bks', LibrarySectionBks);
