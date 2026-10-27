import { css } from 'lit';

export const deletedCopyTableBksStyles = css`
  :host {
    display: block;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  thead {
    background-color: #2d3748;
    text-align: left;
    color: var(--clr-text-muted);
    font-family: var(--font-title);
    font-size: var(--step--1);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  thead th:first-child {
    border-radius: var(--border-radius-default) 0 0 0;
  }

  thead th:last-child {
    border-radius: 0 var(--border-radius-default) 0 0;
  }

  tbody {
    background-color: var(--clr-card-gray);
  }

  th,
  td {
    padding: 1.2rem;
  }

  tbody td {
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }

  button-bks {
    margin-top: 0;
  }
`;
