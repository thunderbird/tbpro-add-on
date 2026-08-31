/**
 * Startup must leave the Send cloud file setup alone when it cannot read
 * storage.
 *
 * With Thunderbird's QuotaManager broken (Bug 2067502), every
 * browser.storage.local call rejects, for every add-on in the profile.
 * background.ts's main() used to read that as "signed out" and unregister the
 * Send cloud file provider — taking sending away from users who were still
 * signed in, for the rest of the session (Bug 2064203 comment 4). Now
 * cloudFileStartupAction() answers 'leave-as-is' when storage is unreadable,
 * and main() must touch neither the provider registration nor the account
 * list.
 *
 * Uses real timers: main() retries the read (250ms + 1000ms, see
 * readStoredAuth in menu.ts) before concluding storage is unavailable, so this
 * spec takes ~1.3s of wall clock by design.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('startup with unreadable storage leaves the cloud file setup alone', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardownHost();
  });

  it('neither registers nor unregisters the provider when storage cannot be read', async () => {
    const ctx = stubContext(host);

    // Every read rejects, exactly as under a broken QuotaManager. (Nothing in
    // this startup path writes.)
    ctx.browser.storage.local.get = vi
      .fn()
      .mockRejectedValue(new Error('An unexpected error occurred'));

    // The leave-as-is branch announces itself with a console.warn; that call
    // is the deterministic signal that main()'s switch has completed.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../../background');

    // The add-on's logger (lib/logger) prefixes every console call with the
    // version, so match any argument rather than a fixed position.
    await vi.waitFor(
      () =>
        expect(
          warn.mock.calls.some((call) =>
            call.some((arg) => String(arg).includes('leaving the Send cloud'))
          )
        ).toBe(true),
      { timeout: 4000 }
    );

    expect(
      ctx.browser.CloudFileAccounts.registerProvider
    ).not.toHaveBeenCalled();
    expect(
      ctx.browser.CloudFileAccounts.unregisterProvider
    ).not.toHaveBeenCalled();
    expect(ctx.browser.CloudFileAccounts.createAccount).not.toHaveBeenCalled();
  });
});
