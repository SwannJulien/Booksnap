import { css } from 'lit';

export const paginationBksStyles = css`
  :host {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.2rem;
    background-color: var(--clr-card-gray);
    border-top: 3px solid var(--clr-main-dark);
    border-radius: 0 0 var(--border-radius-default) var(--border-radius-default);
  }

  .buttons {
    display: flex;
    gap: 0.5rem;
  }

  button-bks {
    margin-top: 0;
  }
`;
