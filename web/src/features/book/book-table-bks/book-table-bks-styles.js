import { css } from 'lit';

export const bookTableBksStyles = css`
  :host {
    display: block;
  }

  table {
    table-layout: fixed;
    margin: 2rem 0;
    width: 100%;
    border-collapse: separate;
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

  thead tr:first-child th:first-child {
    border-radius: var(--border-radius-default) 0 0 0;
  }

  thead tr:first-child th:last-child {
    border-radius: 0 var(--border-radius-default) 0 0;
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

  td {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  th:nth-child(1),
  td:nth-child(1) {
    width: 30%;
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: 20%;
  }

  th:nth-child(3),
  td:nth-child(3) {
    width: 10%;
  }

  th:nth-child(4),
  td:nth-child(4) {
    width: 5%;
  }

  th:nth-child(5),
  td:nth-child(5) {
    width: 10%;
  }

  th:nth-child(6),
  td:nth-child(6) {
    width: 15%;
  }

  th:nth-child(7),
  td:nth-child(7) {
    width: 10%;
  }

  td:nth-child(7) {
    overflow: visible;
    white-space: normal;
  }

  tfoot {
    background-color: var(--clr-card-gray);
  }

  tfoot td {
    padding: 1.2rem;
    border-top: 3px solid var(--clr-main-dark);
  }

  tfoot tr:last-child td:first-child {
    border-radius: 0 0 0 var(--border-radius-default);
  }

  tfoot tr:last-child td:last-child {
    border-radius: 0 0 var(--border-radius-default) 0;
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

  .book-detail-container {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .book-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .book-title {
    font-size: var(--step-0);
    color: var(--clr-text-light);
    font-weight: 600;
  }

  .book-year {
    font-size: var(--step--1);
    color: var(--clr-text-muted);
  }

  td:nth-child(2),
  td:nth-child(3),
  td:nth-child(4),
  td:nth-child(5) {
    font-size: var(--step--1);
  }

  td:nth-child(5) {
    color: var(--clr-text-muted);
  }

  .availability-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .availability-container.available .availability-text {
    color: var(--clr-accent);
  }

  .availability-container.available .availability-bar-fill {
    background-color: var(--clr-accent);
  }

  .availability-container.unavailable .availability-text {
    color: oklch(80.8% 0.114 19.571);
  }

  .availability-container.unavailable .availability-bar-fill {
    background-color: oklch(80.8% 0.114 19.571);
  }

  .availability-text {
    font-size: var(--step--1);
    font-weight: 500;
  }

  .availability-bar {
    width: 100%;
    height: 6px;
    background-color: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    overflow: hidden;
  }

  .availability-bar-fill {
    width: var(--availability-percent, 0%);
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .actions-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
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
    fill: var(--clr-text-light);
  }

  .expand-btn svg {
    transition: transform 0.3s ease;
  }

  .expand-btn.expanded {
    background-color: var(--clr-main-dark);
    border-radius: 50%;
    padding: 0.5rem;
  }

  .expand-btn.expanded svg {
    transform: rotate(180deg);
  }

  .action-btn:hover {
    opacity: 0.8;
  }

  .menu-btn svg {
    fill: var(--clr-text-muted);
  }

  .menu-btn:hover svg {
    fill: var(--clr-text-light);
  }

  .menu-btn.active svg {
    fill: var(--clr-accent);
  }

  .action-menu-wrapper {
    position: relative;
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
  }

  .cover-loading {
    position: relative;
  }

  .cover-loading::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: var(--clr-text-light);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .expanded-row td {
    padding: 1rem 1.2rem;
    max-width: none;
    overflow: visible;
    white-space: normal;
  }

  .expanded-content {
    padding: 0.5rem;
  }
  .card-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .book-card {
    background-color: var(--clr-card-gray);
    border: 1px solid var(--clr-border);
    border-radius: var(--border-radius-default);
  }

  .card-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 1rem;
    padding: 1rem;
  }

  .card-main .book-cover,
  .card-main .cover-placeholder {
    width: 68px;
    height: 100px;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .card-title {
    margin: 0;
    font-size: var(--step-0);
    font-weight: 600;
    color: var(--clr-text-light);
  }

  .card-meta {
    margin: 0;
    font-size: var(--step--1);
    color: var(--clr-text-muted);
  }

  .genre-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .genre-chip {
    padding: 0.2rem 0.6rem;
    border: 1px solid;
    border-radius: 999px;
    font-size: var(--step--2);
    font-weight: 500;
  }

  .genre-chip-0 {
    color: #93c5fd;
    border-color: #3b82f6;
    background-color: rgba(59, 130, 246, 0.15);
  }

  .genre-chip-1 {
    color: #c4b5fd;
    border-color: #8b5cf6;
    background-color: rgba(139, 92, 246, 0.15);
  }

  .genre-chip-2 {
    color: #7dd3fc;
    border-color: #0ea5e9;
    background-color: rgba(14, 165, 233, 0.15);
  }

  .genre-chip-3 {
    color: #f0abfc;
    border-color: #d946ef;
    background-color: rgba(217, 70, 239, 0.15);
  }

  .availability-label {
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: var(--step--2);
    font-weight: 700;
  }

  .availability-container.available .availability-label {
    color: var(--clr-accent);
  }

  .availability-container.unavailable .availability-label {
    color: oklch(80.8% 0.114 19.571);
  }

  .availability-count {
    font-size: var(--step--2);
    color: var(--clr-text-muted);
  }

  .card-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .card-actions .expand-btn {
    background-color: var(--clr-main-dark);
    border-radius: 50%;
    padding: 0.5rem;
  }

  .card-expanded {
    padding: 0 1rem 1rem;
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
`;
