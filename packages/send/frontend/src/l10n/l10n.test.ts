import { FluentResource } from '@fluent/bundle';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/vue', () => ({ captureMessage }));

import { loadBundle, resetBundleCache } from './bundles';
import {
  AVAILABLE_LOCALES,
  DEFAULT_LOCALE,
  fallbackChain,
  locale,
  negotiate,
  resetL10n,
  setLocale,
  t,
  tAround,
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

  it('falls through to en-US for a message the locale lacks and reports once', async () => {
    await setLocale(['de']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(t('send-error-unknown')).toBe(
      'Something went wrong. Please try again.'
    );
    t('send-error-unknown');
    // DEV builds warn on the console; production calls Sentry instead.
    const reports = import.meta.env.DEV
      ? warn.mock.calls.filter(([m]) => String(m).includes('fell back'))
      : captureMessage.mock.calls;
    expect(reports).toHaveLength(1);
    warn.mockRestore();
  });

  it('does not call English a fallback when English is the first choice', async () => {
    await setLocale(['en-US', 'de']);
    expect(fallbackChain.value.length).toBeGreaterThan(1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(t('send-copy-link')).toBe('Copy link');
    const reports = import.meta.env.DEV
      ? warn.mock.calls.filter(([m]) => String(m).includes('fell back'))
      : captureMessage.mock.calls;
    expect(reports).toHaveLength(0);
    warn.mockRestore();
  });

  it('renders the text and reports when a message is called without its variable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const text = t('send-upload-progress');
    // Fluent renders the missing variable by name instead of failing; the
    // user never sees the raw id, and the developer gets one report.
    expect(text).not.toBe('send-upload-progress');
    expect(text).toContain('Uploading');
    const reports = import.meta.env.DEV
      ? warn.mock.calls.filter(([m]) => String(m).includes('format error'))
      : captureMessage.mock.calls;
    expect(reports).toHaveLength(1);
    t('send-upload-progress');
    expect(
      import.meta.env.DEV
        ? warn.mock.calls.filter(([m]) => String(m).includes('format error'))
        : captureMessage.mock.calls
    ).toHaveLength(1);
    warn.mockRestore();
  });

  it('keeps the bundles as the original objects', async () => {
    await setLocale(['de']);
    const { defaultBundle } = await import('./bundles');
    expect(fallbackChain.value.at(-1)).toBe(defaultBundle);
  });

  it('treats an empty pattern as missing and never renders blank', async () => {
    await setLocale(['de']);
    // Test-only fixture, kept out of the shipped .ftl files so translators
    // never see it: empty in German, present in English.
    const [de, enUS] = fallbackChain.value;
    de.addResource(new FluentResource('send-test-empty-pattern = { "" }'));
    enUS.addResource(
      new FluentResource('send-test-empty-pattern = Test empty pattern')
    );
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

  it('forgets a failed bundle load so the next call can retry', async () => {
    const first = loadBundle('xx');
    await expect(first).rejects.toThrow('no resource');
    const second = loadBundle('xx');
    expect(second).not.toBe(first);
    await expect(second).rejects.toThrow('no resource');
  });

  it('switches the dayjs locale with the negotiated locale', async () => {
    dayjs.extend(relativeTime);
    await setLocale(['de']);
    expect(dayjs.locale()).toBe('de');
    expect(dayjs().to(dayjs().add(2, 'day'))).toBe('in 2 Tagen');
    await setLocale(['en-US']);
    expect(dayjs.locale()).toBe('en');
  });

  it('ignores an unknown locale and keeps English', async () => {
    expect(await setLocale(['xx-YY'])).toBe(DEFAULT_LOCALE);
    expect(t('send-copy-link')).toBe('Copy link');
  });
});

describe('tAround', () => {
  beforeEach(() => {
    resetL10n();
    resetBundleCache();
  });

  it('splits the sentence around the placeable', () => {
    expect(tAround('send-keys-backup-finalized', 'button')).toEqual([
      'Your key is finalized when you click ',
      '.',
    ]);
  });

  it('returns an empty tail when the placeable ends the sentence', () => {
    expect(tAround('send-report-confirm', 'link')).toEqual([
      'Please confirm your report ',
      '',
    ]);
  });

  it('passes the other arguments through', () => {
    expect(
      tAround('send-confirm-delete-question', 'name', { type: 'folder' })
    ).toEqual(['Are you sure you want to delete the folder “', '”?']);
  });

  it("follows the translation's word order", async () => {
    await setLocale(['de']);
    expect(tAround('send-keys-backup-finalized', 'button')).toEqual([
      'Ihr Schlüssel wird festgelegt, sobald Sie auf ',
      ' klicken.',
    ]);
  });

  it('keeps the whole text when a translation drops the placeable', async () => {
    await setLocale(['de']);
    // Test-only fixture: a translation that omits { $button }.
    fallbackChain.value[0].addResource(
      new FluentResource('send-test-around = Ohne Platzhalter')
    );
    expect(tAround('send-test-around', 'button')).toEqual([
      'Ohne Platzhalter',
      '',
    ]);
  });
});
