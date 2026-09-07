import { css } from 'lit';
import { sharedStyles } from './shared-styles.js';

export const booksnapApp = [
  sharedStyles,
  css`
    :host {
      min-height: 100vh;
      color: var(--clr-text-light);
      display: grid;
      grid-template-columns: auto 1fr;
      padding-right: 2em;
      gap: 2em;
    }

    /* While /auth/me is being read at startup. The <nav> and <main> stay in the document
       and are only hidden: the router needs its outlet to exist, and the nav entries are
       queried on every navigation. */
    :host([session-loading]) {
      grid-template-columns: 1fr;
      padding-right: 0;
    }

    :host([session-loading]) nav,
    :host([session-loading]) main {
      display: none;
    }

    .session-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }

    /* The sign-in screen, which is shown without the navigation: there is nothing to
       navigate to until the visitor is signed in, and offering the menu to someone who is
       not would only produce a row of 401s. The <nav> is kept in the document and hidden
       here rather than dropped from the template — see booksnap-app.js. */
    :host([hide-navigation]) {
      grid-template-columns: 1fr;
      padding-right: 0;
    }

    :host([hide-navigation]) nav {
      display: none;
    }

    /* Below 75rem the nav becomes a fixed bottom bar and <main> reserves 60px for it.
       With no bar there, that reservation only pushes the sign-in card off centre. */
    :host([hide-navigation]) main {
      padding-bottom: 0;
    }

    main {
      padding-top: 20px;
      min-height: 100vh;
    }

    /* A refusal the server sent about the action the user just took, shown over the page
       they stay on. Above the mobile navigation's z-index, or it would be covered by the
       bar it floats over on a tablet. */
    .access-denied {
      position: fixed;
      top: 1rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 200;
      display: flex;
      align-items: center;
      gap: 1em;
      box-sizing: border-box;
      max-width: min(90vw, 30rem);
      margin: 0;
      padding: 0.75em 1em;
      border: 1px solid var(--clr-warning);
      border-radius: var(--border-radius-default);
      background-color: var(--clr-warning-badge);
      color: var(--clr-warning);
      font-size: var(--step--1);
    }

    .access-denied .dismiss {
      flex-shrink: 0;
      border: none;
      background: none;
      color: inherit;
      font-size: var(--step-1);
      line-height: 1;
      cursor: pointer;
    }

    nav {
      box-sizing: border-box;
      height: 100%;
      padding-top: 20px;
      width: clamp(12rem, 25vw, 16rem);
      border-right: 1px solid #000000;
      background-color: var(--clr-nav-dark);

      position: sticky;
      top: 0;
      align-self: start;
      transition: 300ms ease-in-out;
      overflow-x: hidden;
      overflow-y: hidden;
      text-wrap: nowrap;
    }

    nav.close {
      width: 60px;
      padding: 2px;

      a {
        padding: 0.5em;
      }
      li.active a {
        border-inline-start: 2px solid var(--clr-accent);
      }
      .logo {
        display: none;
      }
      ul {
        margin: 1rem 0 0;
      }
      .toggle-btn {
        padding-right: 0.9rem;
      }
      /* Same as the entry labels next to it: the name goes with the collapsed sidebar,
         the way out stays. */
      .user-name {
        display: none;
      }
      li.session {
        justify-content: center;
        padding: 0.5em;
      }
    }

    nav ul {
      list-style: none;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
      margin: 0 1rem;
    }

    nav ul > li:first-child {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-bottom: 16px;
    }

    nav ul li.divider {
      margin-top: 2rem;
      margin-bottom: 1rem;
      padding: 0 1rem;
      height: 1px;
      background-color: var(--clr-border, #4a5568);
    }

    nav ul li a {
      border-inline-start: 4px solid transparent;
    }

    /* Who is signed in, and the way out. One entry rather than two, because on the
       collapsed sidebar and on the mobile bar only the button survives and a second row
       would leave an empty one behind it. */
    nav ul li.session {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.85em;
      color: var(--clr-text-muted);
      font-size: var(--step--1);
    }

    .user-name {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sign-out {
      margin-left: auto;
      display: flex;
      align-items: center;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
    }

    .sign-out svg {
      width: 24px;
      height: 24px;
    }

    .sign-out:hover svg {
      fill: var(--clr-warning);
    }

    nav ul li.active a {
      border-inline-start: 4px solid var(--clr-accent);
      color: var(--clr-text-light);
      background-color: var(--clr-card-gray);
      border-radius: 0 var(--border-radius-default) var(--border-radius-default)
        0;

      svg {
        fill: var(--clr-text-light);
      }
    }

    nav svg {
      width: 30px;
      height: 30px;
      flex-shrink: 0;
      fill: var(--clr-text-muted);
    }

    nav a {
      padding: 0.85em;
      text-decoration: none;
      color: var(--clr-text-muted);
      display: flex;
      align-items: center;
      gap: 1em;
    }

    .logo {
      font-family: var(--font-title), sans-serif;
      font-weight: 600;
      font-size: var(--step-2);
      padding-left: 0.425em;
      padding-bottom: 0.3em;
      color: var(--clr-accent);
    }

    nav a:hover {
      color: var(--clr-text-light);

      svg {
        fill: var(--clr-text-light);
      }
    }

    .toggle-btn {
      margin-left: auto;
      padding-right: 1em;
      border: none;
      background: none;
      cursor: pointer;
      display: flex;
      align-items: center;
    }

    .toggle-btn svg {
      width: 30px;
      height: 30px;
    }

    .toggle-btn svg:hover {
      fill: var(--clr-text-light);
    }

    @media (max-width: 75rem) {
      :host {
        grid-template-columns: 1fr;
        padding-right: 0;
      }
      main {
        padding: 2em 1em 60px 1em;
      }

      nav {
        height: 60px;
        width: 100%;
        border-right: none;
        border-top: 1px solid #000000;
        padding: 0;
        position: fixed;
        top: unset;
        bottom: 0;
        display: flex;
        justify-content: center;
        z-index: 100;

        > ul {
          margin: 0;
          padding: 0;
          display: grid;
          grid-auto-columns: 60px;
          grid-auto-flow: column;
          align-items: center;
          overflow-y: hidden;
        }

        ul li {
          height: 100%;
        }

        ul li span,
        ul li:first-child,
        ul li.divider {
          display: none;
        }

        /* One more 60px cell in the bar, holding the sign-out button alone: the name is a
           <span> and goes with the other labels. The counter's tablet is shared too, so
           this is the one entry that cannot be left to the wide layout. */
        ul li.session {
          justify-content: center;
          padding: 0;
        }

        .sign-out {
          margin-left: 0;
          width: 60px;
          height: 60px;
          justify-content: center;
        }

        ul li:nth-child(9) {
          margin-bottom: 0;
        }

        ul a {
          width: 60px;
          height: 60px;
          padding: 0;
          border-radius: 0;
          justify-content: center;
        }

        a {
          box-sizing: border-box;
          padding: 1em;
          width: auto;
          justify-content: center;
        }
      }
      nav ul li a {
        border-bottom: 4px solid transparent;
        transition: border-bottom 0.5s ease;
      }
      nav ul li.active a {
        border-left: none;
        border-bottom: 4px solid var(--clr-accent);
        border-radius: var(--border-radius-default) var(--border-radius-default)
          0 0;
      }
    }

    @media print {
      nav {
        display: none !important;
      }
    }
  `,
];
