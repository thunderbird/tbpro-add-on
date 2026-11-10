import { negotiateLanguages } from '@fluent/langneg';

export const DEFAULT_LOCALE = 'en-US';

/** Generated from en-US; dev servers (incl. the e2e stack) and tests only. */
export const PSEUDO_LOCALE = 'en-XA';
const PSEUDO_ENABLED = Boolean(
  import.meta.env.DEV || import.meta.env.VITE_TESTING
);

/** Locales with `.ftl` files under `./locales`. Keep sorted. */
export const AVAILABLE_LOCALES: readonly string[] = PSEUDO_ENABLED
  ? ['de', 'en-US', PSEUDO_LOCALE]
  : ['de', 'en-US'];

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
  // The pseudo-locale only ever matches when asked for by name; otherwise an
  // `en` request would pull it into the fallback chain.
  const offered = requested.includes(PSEUDO_LOCALE)
    ? available
    : available.filter((code) => code !== PSEUDO_LOCALE);
  const chain = negotiateLanguages(requested.map(normalize), [...offered], {
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
  const forced = queryOverride();
  if (forced) return [forced];
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

/**
 * `?locale=en-XA` on the page URL, honoured in dev and test builds only. Kept
 * for the tab's session so redirects and reloads that drop the query keep it.
 */
function queryOverride(): string | null {
  if (!PSEUDO_ENABLED || typeof location === 'undefined') return null;
  const key = 'l10n-locale-override';
  const fromQuery = new URLSearchParams(location.search).get('locale');
  try {
    if (fromQuery) sessionStorage.setItem(key, fromQuery);
    return fromQuery ?? sessionStorage.getItem(key);
  } catch {
    return fromQuery;
  }
}
