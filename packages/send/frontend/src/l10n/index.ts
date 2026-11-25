import type { FluentBundle, FluentVariable } from '@fluent/bundle';
import * as Sentry from '@sentry/vue';
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

// Bundles in the user's preference order as negotiated; en-US is always
// present but may sit anywhere in the list. Shallow so the bundles stay the
// original objects (a deep ref would proxy them and break identity checks
// and FluentBundle internals).
const chain = shallowRef<FluentBundle[]>([defaultBundle]);
const reported = new Set<string>();

/** Negotiated locale of the first bundle in the chain. */
export const locale = computed(
  () => chain.value[0]?.locales[0] ?? DEFAULT_LOCALE
);
export const fallbackChain = shallowReadonly(chain);

/** Reports each distinct problem once per session. */
export function report(detail: string, id: string) {
  const key = `${detail}: ${id}`;
  if (reported.has(key)) return;
  reported.add(key);
  if (import.meta.env.DEV) {
    console.warn(`[l10n] ${key}`);
  } else {
    Sentry.captureMessage(`l10n: ${key}`, { level: 'warning' });
  }
}

function formatFrom(bundle: FluentBundle, id: string, args?: L10nArgs) {
  const message = bundle.getMessage(id);
  if (!message?.value) return null;
  const errors: Error[] = [];
  const text = bundle.formatPattern(message.value, args, errors);
  // An empty pattern is treated as missing so the next bundle gets a turn; an
  // empty string may never render.
  if (text.trim() === '') return null;
  return { text, errors };
}

/**
 * Formats a message through the user's locales in preference order; en-US is
 * always in the list, so a message present in English always renders. Usable
 * from anywhere (stores, background scripts), not only components.
 */
export function t(id: string, args?: L10nArgs): string {
  const bundles = chain.value;
  for (let i = 0; i < bundles.length; i++) {
    const found = formatFrom(bundles[i], id, args);
    if (!found) continue;
    const from = bundles[i].locales[0];
    if (found.errors.length) {
      // Fluent still produces text (a missing variable renders as its name),
      // which beats showing the raw id. The cause is a caller bug — a missing
      // argument or a broken translation — so surface it rather than trying
      // the next bundle, where the same call would fail the same way.
      report(
        `format error in ${from}: ${found.errors.map((e) => e.message).join('; ')}`,
        id
      );
    }
    // Only a match outside the user's first choice is a fallback.
    if (i > 0) report(`fell back to ${from} from ${bundles[0].locales[0]}`, id);
    return found.text;
  }
  report('missing in every bundle', id);
  return id;
}

/**
 * Negotiates against what the user asked for, loads the needed bundles, and
 * applies `lang`/`dir` to the document. Safe to call again on locale change.
 */
export async function setLocale(
  requested: readonly string[] = requestedLocales('browser')
): Promise<string> {
  const locales = negotiate(requested);
  const bundles = await Promise.all(
    locales.map((code) =>
      loadBundle(code).catch((error: unknown) => {
        const reason = error instanceof Error ? String(error) : 'unknown error';
        report(`failed to load locale: ${reason}`, code);
        return null;
      })
    )
  );
  chain.value = bundles.filter((b): b is FluentBundle => b !== null);
  const active = locale.value;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = active;
    document.documentElement.dir = RTL.has(active.split('-')[0])
      ? 'rtl'
      : 'ltr';
  }
  return active;
}

const RTL = new Set(['ar', 'fa', 'he', 'ur']);

/** Component entry point; `t` is reactive to locale changes via `chain`. */
export function useL10n() {
  return { t, locale, setLocale };
}

/** Test seam. */
export function resetL10n() {
  chain.value = [defaultBundle];
  reported.clear();
}
