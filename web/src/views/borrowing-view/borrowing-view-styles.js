import { css } from 'lit';
import { sharedStyles } from '../../shared-styles.js';

export const borrowingView = [
  sharedStyles,
  css`
    :host {
      display: block;
      width: 100%;
      max-width: 1280px;
    }

    .header {
      display: flex;
      justify-content: space-between;
    }

    .header p {
      color: var(--clr-text-muted);
    }

    @media (max-width: 56.25rem) {
      .header {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        column-gap: 1rem;
        row-gap: 0.5rem;
        margin-bottom: 1rem;
      }

      .header-title {
        display: contents;
      }

      .header h1 {
        grid-area: 1 / 1;
      }

      .header button-bks {
        grid-area: 1 / 2;
        justify-self: end;
      }

      .header p {
        grid-area: 2 / 1 / 2 / -1;
        margin-top: 1rem;
      }
    }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-top: 2rem;
      flex-wrap: wrap;
      background-color: var(--clr-card-gray);
      padding: 1.2rem;
      border-radius: var(--border-radius-default);
    }

    .mode-switch {
      display: flex;
      gap: 0.25rem;
      border: 1px solid var(--clr-border);
      border-radius: var(--border-radius-default);
      background-color: var(--clr-main-dark);
    }

    .mode-chip {
      padding: 0.8rem 1.5rem;
      border: none;
      border-radius: calc(var(--border-radius-default) - 2px);
      background: none;
      color: var(--clr-text-muted);
      font-family: 'Open Sans';
      font-size: var(--step-0);
      cursor: pointer;
    }

    .mode-chip:hover {
      color: var(--clr-text-light);
    }

    .mode-chip.active {
      background-color: var(--clr-accent);
      color: var(--clr-nav-dark);
      font-weight: 600;
    }

    .quick-filters {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 1.5rem;
    }

    .quick-filters-label {
      text-transform: uppercase;
      letter-spacing: 1px;
      font-size: var(--step--1);
      color: var(--clr-text-muted);
      margin-right: 0.5rem;
    }

    .filter-chip {
      padding: 0.5rem 1rem;
      border: 1px solid var(--clr-border);
      border-radius: 999px;
      background-color: var(--clr-card-gray);
      color: var(--clr-text-light);
      font-size: var(--step--1);
      cursor: pointer;
    }

    .filter-chip:hover {
      border-color: var(--clr-accent);
    }

    .filter-chip.active {
      background-color: var(--clr-accent);
      border-color: var(--clr-accent);
      color: var(--clr-nav-dark);
      font-weight: 600;
    }

    input[name='search'] {
      background-color: var(--clr-main-dark);
      color: var(--clr-text-light);
      background-image: url('../../../assets/search.svg');
      background-repeat: no-repeat;
      background-position: left 10px center;
      background-size: 26px;
      padding-left: 40px;
      width: min(24rem, 100%);
      box-sizing: border-box;

      @media (max-width: 56.25rem) {
        flex: 1 0 100%;
        width: 100%;
        padding: 1rem 0 1rem 40px;
      }
    }

    table {
      table-layout: fixed;
      margin: 2rem 0;
      width: 100%;
      border-radius: var(--border-radius-default);
      border-collapse: separate;
      overflow: hidden;
      border-spacing: 0;
    }

    thead {
      background-color: #2d3748;
      text-transform: uppercase;
      text-align: left;
      color: var(--clr-text-muted);
      font-family: var(--font-title);
      font-size: var(--step--1);
      letter-spacing: 1px;
    }

    tbody {
      background-color: var(--clr-card-gray);
    }

    tbody tr td {
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    }

    th,
    td {
      padding: 1.2rem;
    }

    th:nth-child(1),
    td:nth-child(1) {
      width: 28%;
    }

    th:nth-child(2),
    td:nth-child(2) {
      width: 22%;
    }

    th:nth-child(3),
    td:nth-child(3),
    th:nth-child(4),
    td:nth-child(4) {
      width: 14%;
    }

    th:nth-child(5),
    td:nth-child(5) {
      width: 15%;
    }

    th:nth-child(6),
    td:nth-child(6) {
      width: 7%;
    }

    td:nth-child(3),
    td:nth-child(4) {
      font-size: var(--step--1);
    }

    .book-detail-container {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .book-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .book-title {
      font-weight: 600;
    }

    .book-authors {
      font-size: var(--step--1);
      color: var(--clr-text-muted);
    }

    .book-cover {
      width: 40px;
      height: 60px;
      object-fit: cover;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .cover-placeholder {
      width: 40px;
      height: 60px;
      background-color: #4a5568;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--clr-text-muted);
      font-size: 0.7rem;
      flex-shrink: 0;
    }

    .user-detail-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .user-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background-color: var(--clr-main-dark);
      color: var(--clr-accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--step--1);
      font-weight: 600;
      text-transform: uppercase;
      flex-shrink: 0;
    }

    .user-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .user-name {
      font-weight: 600;
    }

    .user-id {
      font-size: var(--step--1);
      color: var(--clr-text-muted);
    }

    .due-date-late {
      color: var(--clr-warning);
      font-weight: 600;
    }

    .status-pill {
      display: inline-block;
      padding: 0.35rem 0.85rem;
      border-radius: 999px;
      font-size: var(--step--1);
      font-weight: 600;
      white-space: nowrap;
    }

    .status-on-time {
      background-color: var(--clr-accent-badge);
      color: var(--clr-accent);
      border: 1px solid var(--clr-accent);
    }

    .status-late {
      background-color: rgba(255, 76, 76, 0.15);
      color: var(--clr-warning);
      border: 1px solid var(--clr-warning);
    }

    /* A copy is set aside and the clock is ticking: amber, not the "all good" green */
    .status-ready {
      background-color: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      border: 1px solid #f59e0b;
    }

    /* Queued with no copy yet — nothing for the desk to act on */
    .status-waiting {
      background-color: rgba(156, 163, 175, 0.15);
      color: var(--clr-text-muted);
      border: 1px solid var(--clr-border);
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

    .empty-state {
      text-align: center;
      color: var(--clr-text-muted);
    }

    tfoot {
      background-color: var(--clr-card-gray);
    }

    tfoot td {
      padding: 1.2rem;
      border-top: 3px solid var(--clr-main-dark);
    }

    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }

    .footer-btn-container {
      display: flex;
      gap: 0.5rem;
    }

    .footer-btn-container button {
      font-family: 'Open Sans';
      font-size: var(--step-0);
      color: var(--clr-text-light);
      cursor: pointer;
      background-color: var(--clr-main-dark);
      border: 1px solid var(--clr-border);
      border-radius: var(--border-radius-default);
      padding: 0.5rem;
    }

    .footer-btn-container button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-previous {
      width: 6em;
      height: 45px;
    }

    .btn-next {
      width: 4em;
      height: 45px;
    }

    /* ---------- Mobile card layout (< 56.25rem) ----------
       Rendered instead of the table: see _isMobile in borrowing-view.js. */

    .card-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin: 1.5rem 0;
    }

    .loan-card {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem;
      background-color: var(--clr-card-gray);
      border: 1px solid var(--clr-border);
      border-radius: var(--border-radius-default);
    }

    .card-main {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 1rem;
    }

    .card-main .book-cover,
    .card-main .cover-placeholder {
      width: 68px;
      height: 100px;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
      min-width: 0;
    }

    .card-body .book-title {
      overflow-wrap: anywhere;
    }

    /* Reserved even when the row has no action, so every card lines up the same way */
    .card-actions {
      display: flex;
      align-items: flex-start;
      min-width: 32px;
    }

    .card-user,
    .card-dates {
      padding-top: 0.75rem;
      border-top: 1px solid var(--clr-border);
    }

    .card-dates {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      margin: 0;
    }

    .card-dates dt {
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: var(--step--2);
      color: var(--clr-text-muted);
    }

    .card-dates dd {
      margin: 0.25rem 0 0;
      font-size: var(--step--1);
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      padding-top: 1rem;
      border-top: 1px solid var(--clr-border);
      font-size: var(--step--1);
    }

    .card-footer .footer-btn-container button {
      font-size: var(--step--1);
    }
  `,
];
