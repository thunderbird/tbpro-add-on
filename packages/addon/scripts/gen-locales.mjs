// Generates public/_locales/<folder>/messages.json from each locale's Fluent
// files, so the manifest strings (__MSG_*__) come from the same .ftl source as
// the rest of the UI (#1386). Run by scripts/build.sh and `pnpm dev`; the
// output is gitignored.
//
// Folder mapping: Fluent locales are BCP-47 with hyphens, _locales folders use
// underscores, and en-US is written as `en` so the manifest's
// default_locale "en" keeps resolving (de → de, pt-BR → pt_BR, en-US → en).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const addonDir = path.resolve(here, '..');
const frontendDir = path.resolve(addonDir, '../send/frontend');
export const LOCALES_DIR = path.join(frontendDir, 'src/l10n/locales');
const OUT_DIR = path.join(addonDir, 'public/_locales');
const MANIFEST = path.join(addonDir, 'public/manifest.json');

const PREFIX = 'addon-';
const DEFAULT_LOCALE = 'en-US';
// Pseudo-locales are dev/e2e-only and never ship in the XPI.
const SKIPPED_LOCALES = new Set(['en-XA']);

// @fluent/bundle is a send-frontend dependency, not an add-on one.
const { FluentBundle, FluentResource } = createRequire(
  path.join(frontendDir, 'package.json')
)('@fluent/bundle');

/** `en-US` → `en`, `pt-BR` → `pt_BR`. */
export function folderFor(locale) {
  return locale === DEFAULT_LOCALE ? 'en' : locale.replaceAll('-', '_');
}

/** `addon-menu-sign-in-to` → `menuSignInTo`. */
export function keyFor(id) {
  return id
    .slice(PREFIX.length)
    .replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/**
 * Formats every addon-* message of one locale. `sources` are the locale's .ftl
 * files (all of them, so terms defined in another file resolve). A message
 * that is missing, empty or fails to format is omitted, and browser.i18n
 * falls back to default_locale for it.
 */
export function buildMessages(locale, sources) {
  const bundle = new FluentBundle(locale, { useIsolating: false });
  const ids = [];
  for (const source of sources) {
    const resource = new FluentResource(source);
    bundle.addResource(resource);
    for (const entry of resource.body) {
      if (entry.id.startsWith(PREFIX)) ids.push(entry.id);
    }
  }
  const messages = {};
  for (const id of ids.sort((a, b) => a.localeCompare(b))) {
    const message = bundle.getMessage(id);
    if (!message?.value) continue;
    const errors = [];
    const text = bundle.formatPattern(message.value, undefined, errors);
    if (errors.length || text.trim() === '') continue;
    messages[keyFor(id)] = { message: text };
  }
  return messages;
}

/** __MSG_x__ keys the manifest references. */
export function manifestKeys(manifestText) {
  return [...manifestText.matchAll(/__MSG_(\w+?)__/g)].map((m) => m[1]);
}

function readSources(locale) {
  const dir = path.join(LOCALES_DIR, locale);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ftl'))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
}

export function main() {
  const locales = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !SKIPPED_LOCALES.has(d.name))
    .map((d) => d.name)
    .sort();

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  for (const locale of locales) {
    const messages = buildMessages(locale, readSources(locale));
    if (!Object.keys(messages).length) continue;
    const dir = path.join(OUT_DIR, folderFor(locale));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'messages.json'),
      JSON.stringify(messages, null, 2) + '\n'
    );
  }

  // The default locale must cover the manifest, or Thunderbird shows raw
  // __MSG_ keys as the add-on name.
  const defaults = buildMessages(DEFAULT_LOCALE, readSources(DEFAULT_LOCALE));
  const missing = manifestKeys(fs.readFileSync(MANIFEST, 'utf8')).filter(
    (key) => !defaults[key]
  );
  if (missing.length) {
    throw new Error(`${DEFAULT_LOCALE} lacks manifest messages: ${missing}`);
  }
  console.log(`_locales: ${locales.map(folderFor).join(', ')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
