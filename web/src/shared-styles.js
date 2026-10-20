import { css } from 'lit';

export const sharedStyles = css`
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: 0;
    padding: 0;
  }

  .card {
    padding: 1.5em 1.5em;
    margin: 2rem 0;
    border-radius: var(--border-radius-default);
    background: var(--clr-card-gray);
  }

  .card-title {
    margin-bottom: 1.5rem;
  }

  label {
    text-align: left;
    padding-right: 1em;
    font-size: var(--step-0);
  }

  input,
  select {
    padding: 0.6em;
    border: 1px solid var(--clr-border);
    border-radius: var(--border-radius-default);
    font-size: var(--step-0);

    @media (max-width: 56.25rem) {
      font-size: var(--step--1);
      border-radius: var(--border-radius-mobile);
    }
  }

  input:user-invalid,
  select:user-invalid {
    border: solid 2px red;
  }

  input:focus {
    outline: none;
  }
`;
