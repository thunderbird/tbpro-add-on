import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/vue', () => ({ captureMessage }));

import { resetBundleCache } from './bundles';
import {
  AVAILABLE_LOCALES,
  DEFAULT_LOCALE,
  fallbackChain,
  locale,
  negotiate,
  resetL10n,
  setLocale,
  t,
} from './index';
import { requestedLocales } from './negotiate';

describe('negotiate', () => {
  it('always ends the chain with en-US', () => {
    expect(negotiate(['de'])).toEqual(['de', 'en-US']);
    expect(negotiate(['en-US'])).toEqual(['en-US']);
    expect(negotiate(['xx'])).toEqual(['en-US']);
  });

  it('matches a regional request to the base locale', () => {
    expect(negotiate(['de-AT'])[0]).toBe('de');
  });

  it("maps Thunderbird's ja-JP-mac to ja", () => {
    expect(negotiate(['ja-JP-mac'], ['ja', 'en-US'])).toEqual(['ja', 'en-US']);
  });

  it('lists available locales sorted', () => {
    expect([...AVAILABLE_LOCALES]).toEqual([...AVAILABLE_LOCALES].sort());
  });
});

describe('requestedLocales', () => {
  afterEach(() => {
    delete (globalThis as { browser?: unknown }).browser;
  });

  it("uses Thunderbird's UI language for add-on surfaces when present", () => {
    (globalThis as { browser?: unknown }).browser = {
      i18n: { getUILanguage: () => 'de' },
    };
    expect(requestedLocales('thunderbird')).toEqual(['de']);
    expect(requestedLocales('browser')).toEqual([...navigator.languages]);
  });

  it('falls back to navigator.languages without the extension API', () => {
    expect(requestedLocales('thunderbird')).toEqual([...navigator.languages]);
  });
});

describe('t / setLocale', () => {
  beforeEach(() => {
    resetL10n();
    resetBundleCache();
    captureMessage.mockClear();
  });

  it('starts in en-US with only the default bundle', () => {
    expect(locale.value).toBe(DEFAULT_LOCALE);
    expect(fallbackChain.value).toHaveLength(1);
    expect(t('send-copy-link')).toBe('Copy link');
  });

  it('loads German and formats plurals and terms', async () => {
    expect(await setLocale(['de-DE'])).toBe('de');
    expect(t('send-copy-link')).toBe('Link kopieren');
    expect(t('send-popup-title')).toBe('Mit Thunderbird Send teilen');
    expect(t('send-upload-progress', { count: 1 })).toBe(
      '1 Datei wird hochgeladen…'
    );
    expect(t('send-upload-progress', { count: 3 })).toBe(
      '3 Dateien werden hochgeladen…'
    );
  });

  it('falls through to en-US for a message the locale lacks', async () => {
    await setLocale(['de']);
    expect(t('send-error-unknown')).toBe(
      'Something went wrong. Please try again.'
    );
  });

  it('treats an empty pattern as missing and never renders blank', async () => {
    await setLocale(['de']);
    expect(t('send-test-empty-pattern')).toBe('Test empty pattern');
  });

  it('returns the id and reports once when no bundle has it', async () => {
    await setLocale(['de']);
    expect(t('send-does-not-exist')).toBe('send-does-not-exist');
    expect(t('send-does-not-exist')).toBe('send-does-not-exist');
    // DEV builds warn on the console instead of calling Sentry.
    expect(captureMessage).toHaveBeenCalledTimes(import.meta.env.DEV ? 0 : 1);
  });

  it('sets lang and dir on the document', async () => {
    await setLocale(['de']);
    expect(document.documentElement.lang).toBe('de');
    expect(document.documentElement.dir).toBe('ltr');
    await setLocale(['en-US']);
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('ignores an unknown locale and keeps English', async () => {
    expect(await setLocale(['xx-YY'])).toBe(DEFAULT_LOCALE);
    expect(t('send-copy-link')).toBe('Copy link');
  });
});
