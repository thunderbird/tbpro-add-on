import { FluentBundle, FluentResource } from '@fluent/bundle';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pseudoLocalize,
  pseudoText,
} from '../../scripts/gen-pseudo-locale.mjs';
import { resetBundleCache } from './bundles';
import { negotiate, requestedLocales, resetL10n, setLocale, t } from './index';

vi.mock('@sentry/vue', () => ({ captureMessage: vi.fn() }));

const format = (ftl: string, id: string, args?: Record<string, number>) => {
  const bundle = new FluentBundle('en-XA', { useIsolating: false });
  expect(bundle.addResource(new FluentResource(ftl))).toEqual([]);
  const errors: Error[] = [];
  const text = bundle.formatPattern(bundle.getMessage(id).value, args, errors);
  expect(errors).toEqual([]);
  return text;
};

describe('gen-pseudo-locale', () => {
  it('accents, stretches and brackets text', () => {
    expect(pseudoText('Copy link')).toBe('[Çóþý ļíñķ····]');
  });

  it('leaves placeables, selectors and terms untouched', () => {
    const ftl = pseudoLocalize(
      [
        '-brand = Thunderbird Send',
        'title = Share with { -brand }',
        'progress =',
        '    { $count ->',
        '        [one] Uploading { $count } file',
        '       *[other] Uploading { $count } files',
        '    }',
        'multi =',
        '    First line',
        '    second line',
        '    .title = Tooltip',
      ].join('\n')
    );
    expect(format(ftl, 'title')).toBe('[Šĥáŕé ŵíţĥ Thunderbird Send····]');
    expect(format(ftl, 'progress', { count: 1 })).toBe(
      '[Úþļóáðíñĝ 1 ƒíļé······]'
    );
    expect(format(ftl, 'progress', { count: 2 })).toBe(
      '[Úþļóáðíñĝ 2 ƒíļéš······]'
    );
    expect(format(ftl, 'multi')).toBe('[Ƒíŕšţ ļíñé····]\n[šéçóñð ļíñé····]');
  });
});

describe('en-XA at runtime', () => {
  beforeEach(() => {
    resetL10n();
    resetBundleCache();
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
  });

  it('is only negotiated when asked for by name', () => {
    expect(negotiate(['en'])).toEqual(['en-US']);
    expect(negotiate(['en-XA'])).toEqual(['en-XA', 'en-US']);
  });

  it('is selectable with ?locale= in test builds', async () => {
    window.history.replaceState(null, '', '/send?locale=en-XA');
    expect(requestedLocales('browser')).toEqual(['en-XA']);
    expect(requestedLocales('thunderbird')).toEqual(['en-XA']);
    expect(await setLocale()).toBe('en-XA');
    expect(t('send-sign-out')).toBe('[Šíĝñ óúţ···]');
    // Survives a redirect that drops the query.
    window.history.replaceState(null, '', '/login');
    expect(requestedLocales('browser')).toEqual(['en-XA']);
  });
});
