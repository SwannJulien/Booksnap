import { css } from 'lit';
import { sharedStyles } from '../../../shared-styles.js';

// sharedStyles first: the rules below must be able to override its `input, select` block.
export const accountModalBksStyles = [
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

    input,
    select {
      background-color: var(--clr-main-dark);
      color: var(--clr-text-light);
      box-sizing: border-box;
      width: 100%;
    }

    .field-error,
    .form-error {
      grid-column: 2;
      margin: -0.4rem 0 0;
      color: var(--clr-warning);
      font-size: var(--step--1);
    }

    .form-error {
      grid-column: 1 / -1;
      margin: 0;
      padding: 0.75rem;
      background-color: rgba(239, 68, 68, 0.15);
      border-radius: var(--border-radius-default);
    }

    .house-autocomplete {
      position: relative;
    }

    .house-autocomplete ul {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 10;
      max-height: 200px;
      margin: 4px 0 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
      background-color: var(--clr-main-dark);
      border: 1px solid var(--clr-border);
      border-radius: var(--border-radius-default);
    }

    .house-autocomplete li {
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      color: var(--clr-text-light);
    }

    .house-autocomplete li:hover {
      background-color: var(--clr-card-gray);
    }

    .button-container {
      grid-column: 1 / -1;
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-top: 1rem;
    }

    .password-screen {
      text-align: center;
    }

    .password-screen p {
      margin: 0 0 1rem;
    }

    code {
      padding: 0.25rem 0.5rem;
      font-size: var(--step-1);
      background-color: var(--clr-main-dark);
      border-radius: var(--border-radius-default);
      user-select: all;
    }

    button-bks {
      margin-top: 0;
    }
  `,
];
