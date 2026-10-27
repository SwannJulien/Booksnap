import { css } from 'lit';

export const infoModalBksStyles = css`
  .info-modal-content {
    text-align: center;
  }

  .info-modal-content h2,
  .info-modal-content p {
    margin-top: 0;
  }

  .info-modal-content p {
    white-space: pre-line;
    line-height: 1.8;
  }

  .info-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .info-icon svg {
    width: 48px;
    height: 48px;
    fill: var(--clr-warning);
    background-color: rgba(239, 68, 68, 0.15);
    border-radius: 50%;
    padding: 0.5rem;
  }

  .button-container {
    display: flex;
    justify-content: center;
    margin-top: 2rem;
  }

  button-bks {
    margin-top: 0;
  }
`;
