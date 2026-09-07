import { css } from 'lit';
import { sharedStyles } from '../../shared-styles.js';

// sharedStyles first: the rules below have to be able to override its `input` block, and
// two sheets of equal specificity are decided by the later one.
export const loginView = [
  sharedStyles,
  css`
    :host {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      /* Not 100vh: <main> already carries padding of its own, and the two together add
         up to a page that scrolls by a few pixels with nothing below the fold. */
      min-height: 80vh;
      padding: 2rem 1rem;
    }

    .login-card {
      box-sizing: border-box;
      width: 100%;
      max-width: 26rem;
      margin: 0;
    }

    .logo {
      font-family: var(--font-title), sans-serif;
      font-weight: 600;
      font-size: var(--step-3);
      color: var(--clr-accent);
    }

    .card-title {
      font-family: var(--font-title), sans-serif;
      font-weight: 600;
      font-size: var(--step-1);
      margin-bottom: 0.5rem;
    }

    .hint {
      margin: 0 0 1.5rem;
      color: var(--clr-text-muted);
      font-size: var(--step--1);
    }

    .login-form {
      display: grid;
      gap: 0.5rem;
    }

    .login-form input {
      box-sizing: border-box;
      width: 100%;
      background-color: var(--clr-main-dark);
      color: var(--clr-text-light);
    }

    .login-form label:not(:first-of-type) {
      margin-top: 0.75rem;
    }

    .login-form button-bks {
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

    /* Not the error colours: an expired session is a fact to state, not a mistake to
       flag, and using the same red would make the screen look like the sign-in already
       failed before anything was typed. */
    .message.notice {
      margin: 0 0 1.25rem;
      background-color: var(--clr-accent-badge);
      color: var(--clr-accent);
    }

    @media (max-width: 56.25rem) {
      :host {
        padding: 1.5rem 1rem;
      }

      .login-card {
        max-width: none;
      }

      .login-form button-bks {
        justify-self: stretch;
      }
    }
  `,
];
