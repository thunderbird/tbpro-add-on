import { denyStorage, getByTestId } from '@send-frontend/lib/testUtils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the real send.js entry (Bugzilla 2064458).
 *
 * The regression this guards: a static import in the entry pulling a module
 * that touches browser storage while being evaluated. With Thunderbird set to
 * block all cookies that access throws, and a static import would hoist the
 * throw ahead of anything that could render an explanation — the page would
 * be blank again. So the entry must render its checklist and stop, with the
 * app bundle never loaded, when storage is denied; and load it exactly once,
 * then clean up after itself, when it is not.
 */

const startApp = vi.hoisted(() => vi.fn());
vi.mock('@send-frontend/apps/send/startApp', () => ({ startApp }));

function stubBackend(cookiesEnabled: boolean) {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/cookie-check/verify')) {
        return json({ cookiesEnabled });
      }
      if (url.endsWith('/api/cookie-check/set')) {
        return json({ ok: true });
      }
      return json({});
    })
  );
}

async function loadEntry() {
  vi.resetModules();
  await import('@send-frontend/apps/send/send');
  await flushPromises();
}

const query = (testId: string) =>
  document.querySelector<HTMLElement>(getByTestId(testId));

describe('send.js two-stage boot', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    startApp.mockReset();
    startApp.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('with storage denied, still renders the checklist and never loads the app', async () => {
    stubBackend(true);
    const restore = denyStorage('localStorage', 'sessionStorage');
    try {
      await loadEntry();
    } finally {
      restore();
    }

    expect(query('boot-diagnostics')).not.toBeNull();
    expect(query('boot-step-storage')?.dataset.status).toBe('failed');
    expect(query('boot-step-storage-detail')?.textContent).toContain(
      'SecurityError: The operation is insecure.'
    );
    expect(startApp).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    // `#app` is left untouched for the real app; the panel lives beside it.
    expect(document.getElementById('app')?.childElementCount).toBe(0);
  });

  it('when the checks pass, loads the app once and removes the panel', async () => {
    stubBackend(true);
    await loadEntry();

    await vi.waitFor(() => expect(startApp).toHaveBeenCalledTimes(1));
    await flushPromises();
    expect(query('boot-diagnostics')).toBeNull();
  });

  it('when the app bundle fails to evaluate, reports it as the last step', async () => {
    stubBackend(true);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.doMock('@send-frontend/apps/send/startApp', () => {
      throw new Error('Importing a module script failed.');
    });
    try {
      await loadEntry();
      await vi.waitFor(() =>
        expect(query('boot-step-app')?.dataset.status).toBe('failed')
      );
      // vitest wraps a throwing factory in its own message; the point is that
      // *some* error text reaches the user instead of a blank page.
      expect(query('boot-step-app-detail')?.textContent).toMatch(/error/i);
      expect(query('boot-continue')).toBeNull();
    } finally {
      // Restore the file-level mock: doUnmock alone would make the next test
      // load the real module.
      vi.doMock('@send-frontend/apps/send/startApp', () => ({ startApp }));
      consoleError.mockRestore();
    }
  });

  it('on blocked cross-site cookies, holds the app until the user continues', async () => {
    stubBackend(false);
    await loadEntry();

    await vi.waitFor(() => expect(query('boot-continue')).not.toBeNull());
    expect(startApp).not.toHaveBeenCalled();

    query('boot-continue')?.click();
    await vi.waitFor(() => expect(startApp).toHaveBeenCalledTimes(1));
  });
});
