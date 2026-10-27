import { css } from 'lit';

export const historyModalBksStyles = css`
  .history-content {
    min-width: min(70vw, 56rem);
    max-height: 70vh;
    overflow-y: auto;
  }

  h2 {
    margin: 0 0 1rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    color: var(--clr-text-muted);
    text-transform: uppercase;
    font-size: var(--step--1);
    letter-spacing: 1px;
  }

  th,
  td {
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }

  button-bks {
    display: block;
    text-align: center;
  }
`;
