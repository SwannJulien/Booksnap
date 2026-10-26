import { LitElement, html, nothing } from 'lit';
import { Task } from '@lit/task';
import { librarySectionBksStyles } from './library-section-bks-styles.js';
import { createLibrary, getLibraries } from '../../../api/library.js';
import '../../../components/button-bks/button-bks.js';
import '../../../components/spinner-bks/spinner-bks.js';

export class LibrarySectionBks extends LitElement {
  static styles = librarySectionBksStyles;

  static properties = {
    _adding: { state: true },
    _error: { state: true },
    _submitting: { state: true },
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
  }

  render() {
    return html`
      <section aria-labelledby="libraries-title">
        <h2 id="libraries-title">Libraries</h2>
        ${this.librariesTask.render({
          pending: () => html`<spinner-bks></spinner-bks>`,
          complete: libraries =>
            libraries.length === 0
              ? html`<p>No library yet.</p>`
              : html`<ul>
                  ${libraries.map(library => html`<li>${library.name}</li>`)}
                </ul>`,
          error: () =>
            html`<p role="alert">The libraries could not be loaded.</p>`,
        })}
        ${this._adding ? this._renderForm() : this._renderAddButton()}
      </section>
    `;
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
          ?disabled=${this._submitting}
        ></button-bks>
        <button-bks label="Cancel" @click=${this._closeForm}></button-bks>
        ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
      </form>
    `;
  }

  _openForm() {
    this._adding = true;
  }

  _closeForm() {
    this._adding = false;
    this._error = '';
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
    } catch (error) {
      this._error = error.message;
    } finally {
      this._submitting = false;
    }
  }
}

customElements.define('library-section-bks', LibrarySectionBks);
