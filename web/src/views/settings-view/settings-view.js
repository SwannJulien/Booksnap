import { LitElement, html, nothing } from 'lit';
import { settingsView } from './settings-view-styles.js';
import { isAdmin, isStaff } from '../../auth-state.js';
import '../../features/library/library-section-bks/library-section-bks.js';
import '../../features/library/loan-rules-section-bks/loan-rules-section-bks.js';

export class SettingsView extends LitElement {
  static styles = [settingsView];

  static properties = {};

  render() {
    return html`
      <h1>Settings</h1>
      ${isAdmin()
        ? html`<library-section-bks
            @libraries-changed=${this._reloadLoanRules}
          ></library-section-bks>`
        : nothing}
      ${isStaff()
        ? html`<loan-rules-section-bks
            ?editable=${isAdmin()}
          ></loan-rules-section-bks>`
        : nothing}
    `;
  }

  _reloadLoanRules() {
    this.renderRoot.querySelector('loan-rules-section-bks')?.reload();
  }
}

customElements.define('settings-view', SettingsView);
