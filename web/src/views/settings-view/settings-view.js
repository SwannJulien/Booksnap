import { LitElement, html, nothing } from 'lit';
import { settingsView } from './settings-view-styles.js';
import { isAdmin } from '../../auth-state.js';
import '../../features/library/library-section-bks/library-section-bks.js';

export class SettingsView extends LitElement {
  static styles = [settingsView];

  static properties = {};

  render() {
    return html`
      <h1>Settings View</h1>
      ${isAdmin() ? html`<library-section-bks></library-section-bks>` : nothing}
    `;
  }
}

customElements.define('settings-view', SettingsView);
