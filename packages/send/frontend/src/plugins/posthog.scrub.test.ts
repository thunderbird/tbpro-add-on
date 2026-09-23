import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for issue #1254 ("Send: sanitize URLs sent to PostHog").
 *
 * The `/share/:linkId` and `/locked/:linkId` routes carry a bearer secret in
 * the path. PostHog's default URL/pageview/autocapture properties would leak
 * that secret to analytics, so `plugins/posthog.js`:
 *   1. redacts the id from every string in the capture payload's
 *      `properties`, `$set`, and `$set_once` containers via a `before_send`
 *      hook — covering session-entry props (`$session_entry_url`,
 *      `$session_entry_pathname`) and initial person props
 *      (`$set_once.$initial_current_url`, …), not just `$current_url`-style
 *      event props, and
 *   2. reduces capture surface (`autocapture: false`, `capture_pageview: false`).
 *
 * This locks in both the pure redaction helper and the `posthog.init` wiring.
 */

// Observable stand-in for posthog-js so we can inspect the init options
// without any network activity. Keep the mock minimal.
const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: posthogMock }));

// A configured project key so initPosthog() actually calls posthog.init().
vi.mock('@send-frontend/config', () => ({
  default: {
    posthogProjectKey: 'phc_test_key',
    posthogHost: 'https://posthog.example',
  },
}));

async function loadPlugin() {
  vi.resetModules();
  return import('@send-frontend/plugins/posthog');
}

describe('redactSensitiveUrl (issue #1254)', () => {
  it('redacts /share/<uuid>', async () => {
    const { redactSensitiveUrl } = await loadPlugin();
    expect(
      redactSensitiveUrl(
        'https://send.tb.pro/share/123e4567-e89b-12d3-a456-426614174000'
      )
    ).toBe('https://send.tb.pro/share/[redacted]');
  });

  it('redacts /locked/<uuid>', async () => {
    const { redactSensitiveUrl } = await loadPlugin();
    expect(
      redactSensitiveUrl(
        'https://send.tb.pro/locked/123e4567-e89b-12d3-a456-426614174000'
      )
    ).toBe('https://send.tb.pro/locked/[redacted]');
  });

  it('redacts the id but preserves the query string', async () => {
    const { redactSensitiveUrl } = await loadPlugin();
    expect(
      redactSensitiveUrl('https://send.tb.pro/share/secret-id?foo=bar&baz=1')
    ).toBe('https://send.tb.pro/share/[redacted]?foo=bar&baz=1');
    expect(
      redactSensitiveUrl('https://send.tb.pro/locked/secret-id?x=1#frag')
    ).toBe('https://send.tb.pro/locked/[redacted]?x=1#frag');
  });

  it('redacts a bare /share/<id> pathname (no origin)', async () => {
    const { redactSensitiveUrl } = await loadPlugin();
    expect(redactSensitiveUrl('/share/abc123')).toBe('/share/[redacted]');
    expect(redactSensitiveUrl('/locked/abc123')).toBe('/locked/[redacted]');
  });

  it('leaves non-sensitive URLs untouched', async () => {
    const { redactSensitiveUrl } = await loadPlugin();
    for (const url of [
      'https://send.tb.pro/',
      'https://send.tb.pro/folder/42',
      'https://send.tb.pro/admin',
      '/passphrase',
    ]) {
      expect(redactSensitiveUrl(url)).toBe(url);
    }
  });

  it('does not choke on non-string input', async () => {
    const { redactSensitiveUrl } = await loadPlugin();
    expect(redactSensitiveUrl(undefined)).toBe(undefined);
    expect(redactSensitiveUrl(null)).toBe(null);
  });
});

describe('posthog.init wiring (issue #1254)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('wires before_send, disables autocapture and auto pageview, and keeps consent gating', async () => {
    const { setPosthogConsent } = await loadPlugin();

    // No init until consent is granted (opt-in gating, issue #892).
    expect(posthogMock.init).not.toHaveBeenCalled();

    setPosthogConsent(true);

    expect(posthogMock.init).toHaveBeenCalledTimes(1);
    const [, options] = posthogMock.init.mock.calls[0];
    expect(options).toMatchObject({
      api_host: 'https://posthog.example',
      persistence: 'memory',
      autocapture: false,
      capture_pageview: false,
    });
    expect(typeof options.before_send).toBe('function');
    // Consent gating preserved: opt-in is called on enable.
    expect(posthogMock.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it('before_send scrubs every URL-bearing property before an event leaves the browser', async () => {
    const { setPosthogConsent } = await loadPlugin();
    setPosthogConsent(true);
    const [, options] = posthogMock.init.mock.calls[0];

    const scrubbed = options.before_send({
      event: '$pageview',
      properties: {
        $current_url: 'https://send.tb.pro/share/secret?a=1',
        $pathname: '/locked/secret',
        $referrer: 'https://send.tb.pro/share/other-secret',
        $prev_pageview_pathname: '/share/prev-secret',
        keep: 'https://send.tb.pro/folder/42',
      },
    });

    expect(scrubbed.properties.$current_url).toBe(
      'https://send.tb.pro/share/[redacted]?a=1'
    );
    expect(scrubbed.properties.$pathname).toBe('/locked/[redacted]');
    expect(scrubbed.properties.$referrer).toBe(
      'https://send.tb.pro/share/[redacted]'
    );
    expect(scrubbed.properties.$prev_pageview_pathname).toBe(
      '/share/[redacted]'
    );
    // Non-URL property left untouched.
    expect(scrubbed.properties.keep).toBe('https://send.tb.pro/folder/42');
  });

  it('before_send scrubs session-entry props, which ride on every event of a session entered via /share/<id>', async () => {
    const { setPosthogConsent } = await loadPlugin();
    setPosthogConsent(true);
    const [, options] = posthogMock.init.mock.calls[0];

    // Shape per posthog-js SessionPropsManager.getSessionProps().
    const scrubbed = options.before_send({
      event: 'FILE_DOWNLOADED',
      properties: {
        $session_entry_url: 'https://send.tb.pro/share/entry-secret',
        $session_entry_pathname: '/share/entry-secret',
        $session_entry_referring_domain: 'send.tb.pro',
      },
    });

    expect(scrubbed.properties.$session_entry_url).toBe(
      'https://send.tb.pro/share/[redacted]'
    );
    expect(scrubbed.properties.$session_entry_pathname).toBe(
      '/share/[redacted]'
    );
    expect(scrubbed.properties.$session_entry_referring_domain).toBe(
      'send.tb.pro'
    );
  });

  it('before_send scrubs initial person props in top-level $set/$set_once (sent with $identify)', async () => {
    const { setPosthogConsent } = await loadPlugin();
    setPosthogConsent(true);
    const [, options] = posthogMock.init.mock.calls[0];

    // Shape per posthog-js _calculate_set_once_properties(): initial person
    // info is merged into the TOP-LEVEL $set_once of the capture payload,
    // not into event properties.
    const scrubbed = options.before_send({
      event: '$identify',
      properties: {},
      $set: {
        last_seen_url: 'https://send.tb.pro/share/set-secret',
      },
      $set_once: {
        $initial_current_url: 'https://send.tb.pro/share/initial-secret?x=1',
        $initial_pathname: '/share/initial-secret',
        $initial_referrer: 'https://send.tb.pro/locked/ref-secret',
        $initial_referring_domain: 'send.tb.pro',
      },
    });

    expect(scrubbed.$set.last_seen_url).toBe(
      'https://send.tb.pro/share/[redacted]'
    );
    expect(scrubbed.$set_once.$initial_current_url).toBe(
      'https://send.tb.pro/share/[redacted]?x=1'
    );
    expect(scrubbed.$set_once.$initial_pathname).toBe('/share/[redacted]');
    expect(scrubbed.$set_once.$initial_referrer).toBe(
      'https://send.tb.pro/locked/[redacted]'
    );
    expect(scrubbed.$set_once.$initial_referring_domain).toBe('send.tb.pro');
  });

  it('before_send scrubs nested objects and arrays inside properties', async () => {
    const { setPosthogConsent } = await loadPlugin();
    setPosthogConsent(true);
    const [, options] = posthogMock.init.mock.calls[0];

    const scrubbed = options.before_send({
      event: 'custom',
      properties: {
        nested: { url: 'https://send.tb.pro/share/nested-secret' },
        list: ['/locked/list-secret', 42, null],
      },
    });

    expect(scrubbed.properties.nested.url).toBe(
      'https://send.tb.pro/share/[redacted]'
    );
    expect(scrubbed.properties.list).toEqual(['/locked/[redacted]', 42, null]);
  });

  it('before_send tolerates an event without properties', async () => {
    const { setPosthogConsent } = await loadPlugin();
    setPosthogConsent(true);
    const [, options] = posthogMock.init.mock.calls[0];
    const result = options.before_send({ event: 'bare' });
    expect(result).toEqual({ event: 'bare' });
  });

  it('before_send tolerates a null capture result', async () => {
    const { setPosthogConsent } = await loadPlugin();
    setPosthogConsent(true);
    const [, options] = posthogMock.init.mock.calls[0];
    expect(options.before_send(null)).toBe(null);
  });
});
