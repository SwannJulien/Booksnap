import { css } from 'lit';
import { sharedStyles } from '../../../shared-styles.js';

// sharedStyles first: the rules below must be able to override its `input, select` block.
export const roleModalBksStyles = [
  sharedStyles,
  css`
    :host {
      display: block;
    }

    h2 {
      margin-bottom: 1.5rem;
      text-align: center;
    }

    form {
      display: grid;
      grid-template-columns: max-content minmax(14rem, 1fr);
      align-items: center;
      gap: 0.75rem 1rem;
    }

    select {
      background-color: var(--clr-main-dark);
      color: var(--clr-text-light);
      box-sizing: border-box;
      width: 100%;
    }

    .notice,
    .form-error {
      grid-column: 1 / -1;
      margin: 0;
    }

    .warning {
      color: var(--clr-warning);
    }

    .form-error {
      padding: 0.75rem;
      color: var(--clr-warning);
      font-size: var(--step--1);
      background-color: rgba(239, 68, 68, 0.15);
      border-radius: var(--border-radius-default);
    }

    .button-container {
      grid-column: 1 / -1;
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-top: 1rem;
    }

    button-bks {
      margin-top: 0;
    }
  `,
];
