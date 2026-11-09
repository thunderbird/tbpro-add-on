import { negotiateLanguages } from '@fluent/langneg';

export const DEFAULT_LOCALE = 'en-US';

/** Locales with a `.ftl` file under `./locales`. Keep sorted. */
export const AVAILABLE_LOCALES = ['de', 'en-US'] as const;
export type Locale = (typeof AVAILABLE_LOCALES)[number];

/**
 * Thunderbird reports `ja-JP-mac` for its macOS Japanese build; Fluent and
 * the l10n repo know it as `ja`.
 */
function normalize(tag: string): string {
  return tag === 'ja-JP-mac' ? 'ja' : tag;
}

/**
 * Orders the available locales by how well they match what the user asked for
 * and always ends with the default, so every chain has a complete bundle.
 */
export function negotiate(
  requested: readonly string[],
  available: readonly string[] = AVAILABLE_LOCALES
): string[] {
  const chain = negotiateLanguages(requested.map(normalize), [...available], {
    defaultLocale: DEFAULT_LOCALE,
  });
  return chain.includes(DEFAULT_LOCALE) ? chain : [...chain, DEFAULT_LOCALE];
}

/**
 * What the user asked for, per surface. Add-on surfaces use Thunderbird's UI
 * language; the web app uses the browser's list. Both exist on extension
 * pages and can disagree, so the caller picks explicitly.
 */
export function requestedLocales(source: 'thunderbird' | 'browser'): string[] {
  if (source === 'thunderbird') {
    const ui = (
      globalThis as { browser?: { i18n?: { getUILanguage?: () => string } } }
    ).browser?.i18n?.getUILanguage?.();
    if (ui) return [ui];
  }
  if (typeof navigator !== 'undefined' && navigator.languages?.length) {
    return [...navigator.languages];
  }
  return [DEFAULT_LOCALE];
}
