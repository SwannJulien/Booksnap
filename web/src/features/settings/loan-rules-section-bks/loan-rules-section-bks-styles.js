import { css } from 'lit';
import { sharedStyles } from '../../../shared-styles.js';

// sharedStyles first: rules below must be able to override its `input` block.
export const loanRulesSectionBksStyles = [
  sharedStyles,
  css`
    :host {
      display: block;
      margin-top: 2rem;
    }

    .subtitle {
      margin: 0 0 1rem;
      color: var(--clr-text-muted);
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li,
    form {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    li {
      max-width: 34rem;
      justify-content: space-between;
    }

    form {
      flex-wrap: wrap;
    }

    form p[role='alert'] {
      flex-basis: 100%;
      margin: 0;
    }

    .library-name {
      flex: 1;
    }

    .rules {
      color: var(--clr-text-muted);
    }

    input[type='number'] {
      width: 5rem;
      flex: none;
    }

    label {
      padding-right: 0;
    }
  `,
];
