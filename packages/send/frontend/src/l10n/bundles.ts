import { FluentBundle, FluentResource } from '@fluent/bundle';
import enUS from './locales/en-US/send.ftl?raw';
import { DEFAULT_LOCALE } from './negotiate';

// Every locale except the default is loaded on demand; the default is part of
// the main bundle so the fallback can never be missing.
const lazySources = import.meta.glob<string>('./locales/*/send.ftl', {
  query: '?raw',
  import: 'default',
});

const cache = new Map<string, Promise<FluentBundle>>();

export function makeBundle(locale: string, source: string): FluentBundle {
  const bundle = new FluentBundle(locale, { useIsolating: false });
  const errors = bundle.addResource(new FluentResource(source));
  if (errors.length && import.meta.env.DEV) {
    console.warn(`[l10n] ${locale}: ${errors.length} parse error(s)`, errors);
  }
  return bundle;
}

export const defaultBundle = makeBundle(DEFAULT_LOCALE, enUS);

export function loadBundle(locale: string): Promise<FluentBundle> {
  if (locale === DEFAULT_LOCALE) return Promise.resolve(defaultBundle);
  let pending = cache.get(locale);
  if (!pending) {
    const loader = lazySources[`./locales/${locale}/send.ftl`];
    pending = loader
      ? loader().then((source) => makeBundle(locale, source))
      : Promise.reject(new Error(`[l10n] no resource for locale ${locale}`));
    cache.set(locale, pending);
  }
  return pending;
}

/** Test seam: forget lazily loaded bundles. */
export function resetBundleCache() {
  cache.clear();
}
