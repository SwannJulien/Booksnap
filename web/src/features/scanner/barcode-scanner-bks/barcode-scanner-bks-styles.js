import { css } from 'lit';
import { sharedStyles } from '../../../shared-styles.js';

export const barcodeScannerBksStyles = [
  sharedStyles,
  css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    :host([hidden]) {
      display: none;
    }

    video {
      width: 100%;
      max-width: 40rem;
      height: auto;
      border: 2px solid #ccc;
      border-radius: var(--border-radius-default);
    }

    :host([autostart]) {
      align-items: center;
    }

    button {
      background-color: var(--clr-accent);
      color: var(--clr-nav-dark);
      border: none;
      border-radius: var(--border-radius-default);
      padding: 0.8em 1.5em;
      cursor: pointer;
      font-size: var(--step-0);
      font-weight: bold;
    }

    button-bks {
      margin-top: 0;
    }

    .error {
      margin: 0;
      color: var(--clr-warning);
      text-align: center;
    }
  `,
];
