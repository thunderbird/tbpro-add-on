import type { FluentBundle, FluentVariable } from '@fluent/bundle';
import * as Sentry from '@sentry/vue';
import dayjs from 'dayjs';
import { computed, shallowReadonly, shallowRef } from 'vue';
import { defaultBundle, loadBundle } from './bundles';
import { DEFAULT_LOCALE, negotiate, requestedLocales } from './negotiate';

export {
  AVAILABLE_LOCALES,
  DEFAULT_LOCALE,
  negotiate,
  requestedLocales,
} from './negotiate';

export type L10nArgs = Record<string, FluentVariable>;

// Bundles in fallback order; the last one is always en-US. Shallow so the
// bundles stay the original objects (a deep ref would proxy them and break
// identity checks and FluentBundle internals).
const chain = shallowRef<FluentBundle[]>([defaultBundle]);
const reported = new Set<string>();

/** Negotiated locale of the first bundle in the chain. */
export const locale = computed(
  () => chain.value[0]?.locales[0] ?? DEFAULT_LOCALE
);
export const fallbackChain = shallowReadonly(chain);

function report(id: string, detail: string) {
  if (reported.has(id)) return;
  reported.add(id);
  if (import.meta.env.DEV) {
    console.warn(`[l10n] ${detail}: ${id}`);
  } else {
    Sentry.captureMessage(`l10n: ${detail}: ${id}`, { level: 'warning' });
  }
}

function formatFrom(bundle: FluentBundle, id: string, args?: L10nArgs) {
  const message = bundle.getMessage(id);
  if (!message?.value) return null;
  const errors: Error[] = [];
  const text = bundle.formatPattern(message.value, args, errors);
  // A format error or an empty pattern is treated as missing so the next
  // bundle gets a turn; an empty string may never render.
  if (errors.length || text.trim() === '') return null;
  return text;
}

/**
 * Formats a message through the fallback chain, ending at en-US. Usable from
 * anywhere (stores, background scripts), not only components.
 */
export function t(id: string, args?: L10nArgs): string {
  for (const bundle of chain.value) {
    const text = formatFrom(bundle, id, args);
    if (text !== null) {
      if (bundle !== defaultBundle || chain.value.length === 1) return text;
      report(id, `fell back to ${DEFAULT_LOCALE}`);
      return text;
    }
  }
  report(id, 'missing in every bundle');
  return id;
}

/**
 * Negotiates against what the user asked for, loads the needed bundles, and
 * applies `lang`/`dir` to the document and the dayjs locale. Safe to call
 * again on locale change.
 */
export async function setLocale(
  requested: readonly string[] = requestedLocales('browser')
): Promise<string> {
  const locales = negotiate(requested);
  const bundles = await Promise.all(
    locales.map((code) => loadBundle(code).catch(() => null))
  );
  chain.value = bundles.filter((b): b is FluentBundle => b !== null);
  const active = locale.value;
  await applyDayjsLocale(active);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = active;
    document.documentElement.dir = RTL.has(active.split('-')[0])
      ? 'rtl'
      : 'ltr';
  }
  return active;
}

const RTL = new Set(['ar', 'fa', 'he', 'ur']);

// Explicit loaders rather than a template-literal import: Vite cannot split a
// variable bare-module import. The UMD files register on the same dayjs
// instance the app imports. Locales without an entry keep dayjs on English.
const DAYJS_LOCALES: Record<string, () => Promise<unknown>> = {
  de: () => import('dayjs/locale/de.js'),
};

async function applyDayjsLocale(code: string) {
  const load = DAYJS_LOCALES[code];
  try {
    if (load) await load();
    dayjs.locale(load ? code : 'en');
  } catch {
    dayjs.locale('en');
  }
}

/** Component entry point; `t` is reactive to locale changes via `chain`. */
export function useL10n() {
  return { t, locale, setLocale };
}

/** Test seam. */
export function resetL10n() {
  chain.value = [defaultBundle];
  reported.clear();
}
