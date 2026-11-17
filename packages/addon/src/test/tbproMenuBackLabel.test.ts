/**
 * Drives menu.ts against the real TBProMenu experiment (implementation.js) in
 * a DOM, so the submenu's back button label is checked where it is built:
 * Thunderbird's own label wins, the add-on's localized backLabel covers
 * windows without one (#1089).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SOURCE = readFileSync(
  resolve(__dirname, '../../public/api/TBProMenu/implementation.js'),
  'utf-8'
);

const MESSENGER_URL = 'chrome://messenger/content/messenger.xhtml';

/** Evaluates the experiment with stubbed chrome globals; returns its API. */
function loadTBProMenu() {
  const win = { document };
  const scope: {
    TBProMenu?: new (extension: unknown) => {
      getAPI(context: unknown): { TBProMenu: typeof browser.TBProMenu };
    };
  } = {};
  const ChromeUtils = {
    importESModule: () => ({
      ExtensionSupport: { openWindows: [win] },
      ExtensionUtils: { ExtensionError: Error },
    }),
  };
  const ExtensionCommon = {
    ExtensionAPI: class {
      constructor(public extension: unknown) {}
    },
    EventManager: class {
      api() {
        return {};
      }
    },
  };
  new Function('ChromeUtils', 'ExtensionCommon', SOURCE).call(
    scope,
    ChromeUtils,
    ExtensionCommon
  );
  const extension = { id: 'test@addon', emit: vi.fn() };
  return new scope.TBProMenu!(extension).getAPI({ extension }).TBProMenu;
}

async function signInGerman() {
  const api = loadTBProMenu();
  vi.stubGlobal('browser', { TBProMenu: api });
  vi.resetModules();
  const { menuLoggedIn, MENU_ACTIONS } = await import('../menu');
  const { setLocale } = await import('@send-frontend/l10n');
  await setLocale(['de']);
  api.create(MENU_ACTIONS.ROOT, { title: '', secondaryTitle: '' });
  await menuLoggedIn({ username: 'user@example.com' });
}

const backButtonLabel = () =>
  document
    .querySelector('#appMenu-tbpro-submenu-root .subviewbutton-back')
    ?.getAttribute('aria-label');

beforeEach(() => {
  Object.defineProperty(document, 'location', {
    configurable: true,
    value: { href: MESSENGER_URL },
  });
  Object.assign(document, {
    createXULElement: (type: string) => document.createElement(type),
  });
  document.body.innerHTML =
    '<div id="appMenu-multiView"></div><div id="appMenu-addon-banners"></div>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TBProMenu submenu back button', () => {
  it("uses the add-on's localized label when Thunderbird has none", async () => {
    await signInGerman();

    expect(backButtonLabel()).toBe('Zurück');
  });

  it("prefers Thunderbird's own back label", async () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<button class="subviewbutton-back" aria-label="Host back"></button>'
    );

    await signInGerman();

    expect(backButtonLabel()).toBe('Host back');
  });
});
