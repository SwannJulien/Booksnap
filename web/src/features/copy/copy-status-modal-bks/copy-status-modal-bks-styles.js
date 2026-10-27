import { css } from 'lit';

export const copyStatusModalBksStyles = css`
  .status-modal-content {
    text-align: center;
  }

  .status-modal-content h2,
  .status-modal-content p {
    margin-top: 0;
  }

  .status-error {
    color: var(--clr-warning);
    background-color: rgba(239, 68, 68, 0.15);
    padding: 0.75rem;
    border-radius: var(--border-radius-default);
    margin-bottom: 1rem;
  }

  .set-aside {
    color: var(--clr-accent);
  }

  .button-container {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 2rem;
  }

  button-bks {
    margin-top: 0;
  }
`;
