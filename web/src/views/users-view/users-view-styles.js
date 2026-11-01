import { css } from 'lit';

export const usersView = css`
  :host {
    display: block;
    width: 100%;
    max-width: 1280px;
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .subtitle {
    color: var(--clr-text-muted);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
    flex-wrap: wrap;
    background-color: var(--clr-card-gray);
    padding: 1.2rem;
    border-radius: var(--border-radius-default);
  }

  input,
  select {
    background-color: var(--clr-main-dark);
    color: var(--clr-text-light);
    box-sizing: border-box;
  }

  input[name='search'] {
    width: min(24rem, 100%);

    @media (max-width: 56.25rem) {
      flex: 1 0 100%;
      width: 100%;
    }
  }

  table {
    table-layout: fixed;
    margin: 2rem 0;
    width: 100%;
    border-radius: var(--border-radius-default);
    border-collapse: separate;
    border-spacing: 0;
  }

  thead {
    text-transform: uppercase;
    text-align: left;
    color: var(--clr-text-muted);
    font-family: var(--font-title);
    font-size: var(--step--1);
    letter-spacing: 1px;
  }

  thead th {
    background-color: #2d3748;
  }

  tbody td {
    background-color: var(--clr-card-gray);
  }

  /* No overflow: hidden on the table, it would clip the action menu of the last row. */
  thead th:first-child {
    border-top-left-radius: var(--border-radius-default);
  }

  thead th:last-child {
    border-top-right-radius: var(--border-radius-default);
  }

  tbody tr:last-child td:first-child {
    border-bottom-left-radius: var(--border-radius-default);
  }

  tbody tr:last-child td:last-child {
    border-bottom-right-radius: var(--border-radius-default);
  }

  tbody tr td {
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }

  th,
  td {
    padding: 1.2rem;
    overflow-wrap: anywhere;
  }

  th:nth-child(1) {
    width: 24%;
  }

  th:nth-child(2) {
    width: 34%;
  }

  th:nth-child(3) {
    width: 16%;
  }

  th:nth-child(4) {
    width: 14%;
  }

  th:nth-child(5) {
    width: 12%;
  }

  .action-menu-wrapper {
    position: relative;
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

  .status-pill {
    display: inline-block;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    font-size: var(--step--1);
    font-weight: 600;
    white-space: nowrap;
  }

  .status-pill.active {
    background-color: var(--clr-accent-badge);
    color: var(--clr-accent);
    border: 1px solid var(--clr-accent);
  }

  .status-pill.deactivated {
    background-color: rgba(156, 163, 175, 0.15);
    color: var(--clr-text-muted);
    border: 1px solid var(--clr-border);
  }

  .empty-state {
    margin: 2rem 0;
    color: var(--clr-text-muted);
  }
`;
