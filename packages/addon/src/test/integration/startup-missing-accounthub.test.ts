/**
 * A missing AccountHub experiment API must not abort startup.
 *
 * Experiment APIs can genuinely be absent at runtime (initTelemetryListener
 * carries the same guard for the same reason), and since the listener
 * registrations moved ahead of the cloud file gate in main(), an unguarded
 * throw there would skip the gate entirely: a signed-in user would never get
 * initCloudFile() (no Send attachments that session), and a fresh profile
 * would never get the Bug 2036665 unregister. This spec pins the guard:
 * with AccountHub absent and a valid stored session, startup must still reach
 * the gate and register the cloud file account.
 */
import { STORAGE_KEY_AUTH } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('startup with a missing AccountHub experiment API', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardownHost();
  });

  it('still reaches the cloud file gate for a signed-in user', async () => {
    const ctx = stubContext(host);

    // The build shipped without the AccountHub experiment API.
    delete (ctx.browser as { AccountHub?: unknown }).AccountHub;

    // A stored session that getLoginState() accepts.
    ctx.browser.storage.local.get = vi.fn(async () => ({
      [STORAGE_KEY_AUTH]: {
        refresh_token: 'refresh-abc',
        profile: { preferred_username: 'user@example.com' },
      },
    }));

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../../background');

    // The gate ran and took the 'register' branch — startup was not aborted
    // by the missing experiment API.
    await vi.waitFor(() =>
      expect(ctx.browser.CloudFileAccounts.createAccount).toHaveBeenCalled()
    );
  });
});
