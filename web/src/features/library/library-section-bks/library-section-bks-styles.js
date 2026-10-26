import { css } from 'lit';
import { sharedStyles } from '../../../shared-styles.js';

// sharedStyles first: rules below must be able to override its `input` block.
export const librarySectionBksStyles = [
  sharedStyles,
  css`
    :host {
      display: block;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
];
