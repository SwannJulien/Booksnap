import { css } from 'lit';
import { sharedStyles } from '../../shared-styles.js';

// sharedStyles first: the rules below have to be able to override its `input` block, and
// two sheets of equal specificity are decided by the later one.
export const accountView = [
  sharedStyles,
  css`
    :host {
      display: block;
      width: 100%;
      max-width: 1280px;
    }

    .header p {
      color: var(--clr-text-muted);
    }

    .card {
      max-width: 34rem;
    }

    .card-title {
      font-family: var(--font-title), sans-serif;
      font-weight: 600;
      font-size: var(--step-2);
      margin-bottom: 0.5rem;
    }

    .hint {
      margin: 0 0 1.5rem;
      color: var(--clr-text-muted);
      font-size: var(--step--1);
    }

    .password-form {
      display: grid;
      gap: 0.5rem 1em;
    }

    .password-form button-bks {
      margin-top: 1rem;
      justify-self: start;
    }

    .message {
      margin: 1.25rem 0 0;
      padding: 0.75em 1em;
      border-radius: var(--border-radius-default);
      font-size: var(--step--1);
    }

    .message.error {
      background-color: var(--clr-warning-badge);
      color: var(--clr-warning);
    }

    .message.success {
      background-color: var(--clr-accent-badge);
      color: var(--clr-accent);
    }
  `,
];
