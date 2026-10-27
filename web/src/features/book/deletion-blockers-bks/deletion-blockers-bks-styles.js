import { css } from 'lit';

export const deletionBlockersBksStyles = css`
  .blockers {
    text-align: start;
    max-height: 40vh;
    overflow-y: auto;
  }

  h3 {
    margin: 1rem 0 0.5rem;
    font-size: 1rem;
    color: var(--clr-text-muted);
  }

  section:first-child h3 {
    margin-top: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    align-items: baseline;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--clr-border);
  }

  .student {
    font-weight: 600;
  }

  .detail {
    color: var(--clr-text-muted);
  }

  .status.overdue {
    color: var(--clr-warning);
    font-weight: 600;
  }
`;
