import { FluentBundle, FluentResource } from '@fluent/bundle';
import enUSAddon from './locales/en-US/addon.ftl?raw';
import enUSSend from './locales/en-US/send.ftl?raw';
import { DEFAULT_LOCALE } from './negotiate';

// Every locale except the default is loaded on demand; the default is part of
// the main bundle so the fallback can never be missing.
// send.ftl holds the shared Send UI, addon.ftl the add-on shell (menu,
// manifest); both go into one bundle per locale.
const lazySources = import.meta.glob<string>('./locales/*/*.ftl', {
  query: '?raw',
  import: 'default',
});

const cache = new Map<string, Promise<FluentBundle>>();

export function makeBundle(
  locale: string,
  sources: readonly string[]
): FluentBundle {
  const bundle = new FluentBundle(locale, { useIsolating: false });
  for (const source of sources) {
    const errors = bundle.addResource(new FluentResource(source));
    if (errors.length && import.meta.env.DEV) {
      console.warn(`[l10n] ${locale}: ${errors.length} parse error(s)`, errors);
    }
  }
  return bundle;
}

export const defaultBundle = makeBundle(DEFAULT_LOCALE, [enUSSend, enUSAddon]);

export function loadBundle(locale: string): Promise<FluentBundle> {
  if (locale === DEFAULT_LOCALE) return Promise.resolve(defaultBundle);
  let pending = cache.get(locale);
  if (!pending) {
    const loaders = Object.entries(lazySources)
      .filter(([path]) => path.startsWith(`./locales/${locale}/`))
      .map(([, load]) => load());
    pending = loaders.length
      ? Promise.all(loaders).then((sources) => makeBundle(locale, sources))
      : Promise.reject(new Error(`[l10n] no resource for locale ${locale}`));
    cache.set(locale, pending);
  }
  return pending;
}

/** Test seam: forget lazily loaded bundles. */
export function resetBundleCache() {
  cache.clear();
}
