import { describe, expect, it } from 'vitest';

import { detectTesting, getWsClientConfig } from '@send-frontend/lib/trpc';
import { TRPC_WS_PATH } from '@send-frontend/lib/config';

/**
 * Regression guard for Bug 2036665.
 *
 * The built-in/system add-on background page imports the trpc module on every
 * Thunderbird launch. The WebSocket client must never open a connection as a
 * side effect of module load, otherwise a fresh, logged-out profile reaches the
 * network at startup and crashes under automation. These tests pin the two
 * guarantees that prevent that:
 *   1. an unconfigured (empty) backend URL means "do not connect", and
 *   2. when configured, the client is created in lazy mode so the socket only
 *      opens on first subscription, not at construction.
 */
describe('getWsClientConfig', () => {
  it('returns null (no connection) when testing', () => {
    expect(getWsClientConfig('https://send-backend.tb.pro', true)).toBeNull();
  });

  it('returns null (no connection) when the backend URL is empty', () => {
    expect(getWsClientConfig('', false)).toBeNull();
  });

  it('enables lazy mode when a backend URL is configured', () => {
    const config = getWsClientConfig('https://send-backend.tb.pro', false);

    expect(config).not.toBeNull();
    expect(config?.url).toBe(`https://send-backend.tb.pro${TRPC_WS_PATH}`);
    expect(config?.lazy?.enabled).toBe(true);
  });
});

describe('detectTesting', () => {
  // Under vitest, Vite injects VITE_TESTING='true', so detection reports a test
  // context (and the WebSocket stays closed). In the shipped bundle the flag is
  // absent and detection falls back to the WebExtension `browser.test` API.
  it('reports a test context when VITE_TESTING is set', () => {
    expect(detectTesting()).toBe(true);
  });
});
