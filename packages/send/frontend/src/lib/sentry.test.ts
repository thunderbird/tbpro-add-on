import * as Sentry from '@sentry/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeSentry, initSentry, scrubBreadcrumb, scrubEvent } from './sentry';

vi.mock('@sentry/vue', () => ({
  init: vi.fn(),
  getClient: vi.fn(() => undefined),
  setTag: vi.fn(),
  close: vi.fn(() => Promise.resolve(true)),
  startSession: vi.fn(),
  captureSession: vi.fn(),
  breadcrumbsIntegration: vi.fn(() => ({ name: 'Breadcrumbs' })),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  captureConsoleIntegration: vi.fn(() => ({ name: 'CaptureConsole' })),
}));

describe('scrubEvent', () => {
  it('drops user identity and sensitive request payloads', () => {
    const event = {
      user: { id: 'user-123', email: 'a@b.com' },
      request: {
        url: 'https://send.tb.pro/download/abc',
        cookies: { session: 'secret' },
        headers: { Authorization: 'Bearer token' },
        query_string: 'token=secret',
        data: { password: 'hunter2' },
      },
    } as unknown as Sentry.ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.headers).toBeUndefined();
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.url).toBe('https://send.tb.pro/download/abc');
  });

  it('strips the access-link secret (fragment) and query from request.url', () => {
    const event = {
      request: { url: 'https://send.tb.pro/download/abc?t=1#s3cretKey' },
    } as unknown as Sentry.ErrorEvent;
    expect(scrubEvent(event).request?.url).toBe(
      'https://send.tb.pro/download/abc'
    );
  });

  it('is a no-op when there is no user or request', () => {
    const event = { message: 'boom' } as Sentry.ErrorEvent;
    expect(scrubEvent(event)).toEqual({ message: 'boom' });
  });
});

describe('scrubBreadcrumb', () => {
  it('strips the fragment secret from navigation breadcrumbs (to/from)', () => {
    const breadcrumb = {
      category: 'navigation',
      data: { from: '/upload?token=t', to: '/download/abc#s3cretKey' },
    } as Sentry.Breadcrumb;

    const scrubbed = scrubBreadcrumb(breadcrumb);

    expect(scrubbed.data?.to).toBe('/download/abc');
    expect(scrubbed.data?.from).toBe('/upload');
  });

  it('strips query and fragment from fetch/xhr breadcrumb URLs', () => {
    const breadcrumb = {
      category: 'fetch',
      data: {
        url: 'https://send.tb.pro/api?token=secret#frag',
        status_code: 200,
      },
    } as Sentry.Breadcrumb;

    const scrubbed = scrubBreadcrumb(breadcrumb);

    expect(scrubbed.data?.url).toBe('https://send.tb.pro/api');
    // Other breadcrumb data is preserved.
    expect(scrubbed.data?.status_code).toBe(200);
  });

  it('leaves breadcrumbs without a URL untouched', () => {
    const breadcrumb = {
      category: 'ui.click',
      message: 'button',
    } as Sentry.Breadcrumb;
    expect(scrubBreadcrumb(breadcrumb)).toEqual({
      category: 'ui.click',
      message: 'button',
    });
  });
});

describe('initSentry', () => {
  const defaults = [{ name: 'Vue' }, { name: 'BrowserSession' }];

  const initOptions = () => {
    const opts = vi.mocked(Sentry.init).mock.calls[0][0]!;
    const integrations = opts.integrations as (
      d: typeof defaults
    ) => { name: string }[];
    return { opts, names: integrations(defaults).map((i) => i.name) };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tags events and sessions with the build version as the release', () => {
    initSentry({} as never);
    expect(initOptions().opts.release).toBe(__APP_VERSION__);
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('keeps the Vue integration and page tracing when given an app', () => {
    const app = {} as never;
    initSentry(app);
    const { opts, names } = initOptions();
    expect(opts.app).toBe(app);
    expect(names).toEqual([
      'Vue',
      'BrowserSession',
      'BrowserTracing',
      'CaptureConsole',
    ]);
  });

  it('works without an app: no Vue, page tracing or console breadcrumbs', () => {
    initSentry();
    const { opts, names } = initOptions();
    expect(opts.app).toBeUndefined();
    expect(opts.release).toBe(__APP_VERSION__);
    expect(names).toEqual(['BrowserSession', 'Breadcrumbs', 'CaptureConsole']);
    expect(Sentry.breadcrumbsIntegration).toHaveBeenCalledWith({
      console: false,
    });
  });

  it('starts a new session only when re-initialized after close', async () => {
    initSentry();
    expect(Sentry.startSession).not.toHaveBeenCalled();

    // close() and the re-init both see the lingering client.
    vi.mocked(Sentry.getClient)
      .mockReturnValueOnce({} as never)
      .mockReturnValueOnce({} as never);
    await closeSentry();
    initSentry();
    expect(Sentry.startSession).toHaveBeenCalledWith({ ignoreDuration: true });
    expect(Sentry.captureSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['with an app', {} as never],
    ['without an app', undefined],
  ])('attaches the privacy scrubbers %s', (_label, app) => {
    initSentry(app);
    const { opts } = initOptions();
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.beforeSend).toBe(scrubEvent);
    expect(opts.beforeBreadcrumb).toBe(scrubBreadcrumb);
  });
});
