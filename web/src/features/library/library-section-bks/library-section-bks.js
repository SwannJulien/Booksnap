import { LitElement, html } from 'lit';
import { Task } from '@lit/task';
import { librarySectionBksStyles } from './library-section-bks-styles.js';
import { getLibraries } from '../../../api/library.js';
import '../../../components/spinner-bks/spinner-bks.js';

export class LibrarySectionBks extends LitElement {
  static styles = [librarySectionBksStyles];

  librariesTask = new Task(this, {
    task: () => getLibraries(),
    args: () => [],
  });

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
      </section>
    `;
  }
}

customElements.define('library-section-bks', LibrarySectionBks);
