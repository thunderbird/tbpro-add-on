import { describe, expect, it } from 'vitest';
import i18n, { defaultLocale } from './i18n';

describe('i18n', () => {
  it('uses the base locale from a regional browser locale', () => {
    expect(defaultLocale('en-US')).toBe('en');
  });

  it('keeps the browser locale and configures English as the fallback', () => {
    expect(defaultLocale('de-DE')).toBe('de');
    expect(i18n.global.fallbackLocale.value).toBe('en');
  });

  it('translates interpolated footer messages', () => {
    expect(
      i18n.global.t('footer.copywrite', {
        mzlaLink: 'MZLA',
        currentYear: 2026,
        creativeCommonsLink: 'Creative Commons',
      })
    ).toBe(
      'Thunderbird is part of MZLA, a wholly owned subsidiary of the not-for-profit Mozilla.org. Portions of this content are \u00a91998\u20132026 by individual contributors. Content available under a Creative Commons.'
    );
  });
});
