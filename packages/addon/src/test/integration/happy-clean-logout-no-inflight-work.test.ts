/**
 * HAPPY PATH — a logout with nothing else in flight closes exactly the
 * expected tabs, clears storage, and opens the logout page, with no
 * unrelated side effects. Correct-behavior counterpart to A1/A5 (which
 * prove what an in-flight popup upload / unrelated staged data suffer when
 * a logout blindsides them). Here there is no popup upload and no unrelated
 * staged data, so menuLogout() should behave exactly as intended.
 */
import { BASE_URL } from '@send-frontend/apps/common/constants';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('Happy path: clean logout with no in-flight work', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('closes only Send tabs, clears storage, and opens the logout page', async () => {
    const ctx = stubContext(host);
    const { menuLogout } = await import('../../menu');

    // A couple of ordinary open tabs: one Send tab, one unrelated site.
    await ctx.browser.tabs.create({ url: `${BASE_URL}/send/profile` });
    await ctx.browser.tabs.create({ url: 'https://example.com/' });

    await menuLogout();

    // The Send tab was closed; the unrelated tab was left alone.
    expect(ctx.browser.tabs.remove).toHaveBeenCalledTimes(1);
    expect(ctx.browser.tabs.remove).toHaveBeenCalledWith(1);

    // Storage was cleared (there was nothing unrelated in it to lose, so
    // this is the intended, harmless case).
    expect(ctx.browser.storage.local.clear).toHaveBeenCalledTimes(1);

    // Menu was reset to the logged-out state.
    expect(ctx.browser.TBProMenu.clear).toHaveBeenCalledWith('root');
    expect(ctx.browser.TBProMenu.update).toHaveBeenCalledWith(
      'root',
      expect.objectContaining({ secondaryTitle: 'thunderbirdPro' })
    );

    // The logout page was opened, after the tab cleanup (matching the
    // load-bearing order menu.test.ts already guards for unit-level).
    expect(ctx.browser.tabs.create).toHaveBeenCalledWith({
      url: `${BASE_URL}/logout`,
    });
  });

  it('SIGN_OUT message end-to-end: background unregisters the cloud file provider with no error', async () => {
    const bg = stubContext(host);
    await import('../../background');

    await bg.deliverMessage({ type: 'SIGN_OUT' });

    expect(bg.browser.CloudFileAccounts.unregisterProvider).toHaveBeenCalled();
    // No pending uploads existed, so there is nothing to orphan here --
    // this is the case A1 is the exception to.
  });
});
