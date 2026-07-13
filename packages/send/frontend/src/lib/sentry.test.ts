import * as Sentry from '@sentry/vue';
import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent } from './sentry';

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
