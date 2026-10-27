import { css } from 'lit';

export const copyTableBksStyles = css`
  :host {
    display: block;
  }

  .copies-table {
    width: 100%;
    margin: 0;
    background-color: var(--clr-card-gray);
    border-radius: var(--border-radius-default);
    border-collapse: separate;
    border-spacing: 0;
  }

  .copies-table td,
  .copies-table th {
    padding: 0.75rem 1rem;
    text-align: left;
  }

  .copies-table thead {
    background-color: var(--clr-main-dark);
    text-transform: uppercase;
    color: var(--clr-text-muted);
    font-family: var(--font-title);
    font-size: var(--step--1);
    letter-spacing: 1px;
  }

  .copies-table thead tr:first-child th:first-child {
    border-radius: var(--border-radius-default) 0 0 0;
  }

  .copies-table thead tr:first-child th:last-child {
    border-radius: 0 var(--border-radius-default) 0 0;
  }

  .copies-table tbody {
    background-color: var(--clr-nav-dark);
  }

  .copies-table tfoot td {
    background-color: var(--clr-main-dark);
    padding: 1.5rem 1rem;
  }

  .copies-table tfoot tr:last-child td:first-child {
    border-radius: 0 0 0 var(--border-radius-default);
  }

  .copies-table tfoot tr:last-child td:last-child {
    border-radius: 0 0 var(--border-radius-default) 0;
  }

  .add-copy-button {
    display: flex;
    flex-direction: row;
    gap: 0.8rem;
    align-items: center;
    background: none;
    color: var(--clr-accent);
    font-size: var(--step--1);
    border: none;
    cursor: pointer;

    svg {
      background-color: var(--clr-accent);
      color: var(--clr-main-dark);
      border-radius: 50%;
    }

    p {
      margin: 0;
    }
  }

  .copies-table tbody tr:not(:last-child) td {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .status-container {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .status-badge {
    display: inline-block;
    padding: 0.3rem 0.6rem;
    border-radius: var(--border-radius-default);
    font-size: var(--step--1);
    font-weight: 500;
    text-transform: capitalize;
  }

  .status-available {
    color: var(--clr-accent);
    border: 1px solid var(--clr-accent);
    background-color: var(--clr-accent-badge);
  }

  .status-borrowed {
    color: var(--clr-warning);
    border: 1px solid var(--clr-warning);
    background-color: var(--clr-warning-badge);
  }

  .status-lost {
    color: var(--clr-text-muted);
    border: 1px solid var(--clr-text-muted);
    background-color: transparent;
  }

  .status-due-date {
    font-size: var(--step--2);
    color: var(--clr-text-muted);
  }

  .loading-message,
  .error-message {
    padding: 1rem;
    text-align: center;
    color: var(--clr-text-muted);
  }

  .error-message {
    color: var(--clr-warning);
  }

  .action-btn {
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    transition: all 0.3s ease;
  }

  .action-btn svg {
    width: 24px;
    height: 24px;
    fill: var(--clr-text-muted);
  }

  .action-btn:hover svg {
    fill: var(--clr-text-light);
  }

  .action-btn.active svg {
    fill: var(--clr-accent);
  }

  .action-menu-wrapper {
    position: relative;
  }

  /* ---------- Mobile card layout (< 56.25rem) ----------
     Rendered instead of the table: see _isMobile in copy-table-bks.js. */

  .copies-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .copies-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .copies-panel-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--step--1);
    font-weight: 600;
    color: var(--clr-text-light);
  }

  .copies-panel-title svg {
    width: 18px;
    height: 18px;
    fill: var(--clr-accent);
  }

  .copies-legend {
    display: flex;
    gap: 0.75rem;
    font-size: var(--step--2);
    color: var(--clr-text-muted);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .legend-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .legend-available {
    background-color: var(--clr-accent);
  }

  .legend-out {
    background-color: var(--clr-warning);
  }

  .copy-cards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .copy-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background-color: var(--clr-nav-dark);
    border: 1px solid var(--clr-border);
    border-radius: var(--border-radius-default);
  }

  .copy-card-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .copy-card-code {
    font-size: var(--step--2);
    color: var(--clr-text-muted);
    overflow-wrap: anywhere;
  }

  .copy-card-section {
    font-size: var(--step--1);
    color: var(--clr-text-light);
    overflow-wrap: anywhere;
  }

  .copy-card .status-container {
    align-items: flex-end;
  }

  /* On the card the button is a full-width dashed drop target, not a table footer row */
  .copies-panel .add-copy-button {
    justify-content: center;
    padding: 0.85rem;
    border: 1px dashed var(--clr-border);
    border-radius: var(--border-radius-default);
  }
`;
