import { css } from 'lit';
import { sharedStyles } from '../../../shared-styles.js';

// sharedStyles first: rules below must be able to override its `input` block.
export const librarySectionBksStyles = [
  sharedStyles,
  css`
    :host {
      display: block;
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
      justify-content: space-between;
    }

    form {
      flex-wrap: wrap;
    }

    form p[role='alert'] {
      flex-basis: 100%;
      margin: 0;
    }

    input {
      flex: 1;
      min-width: 0;
    }

    label {
      padding-right: 0;
    }
  `,
];
