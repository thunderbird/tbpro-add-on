// Generates the en-XA pseudo-locale from en-US (#1386): every message is
// accented, stretched ~35 % with `·` and bracketed, so un-migrated English and
// clipped layouts stand out. Placeables, selectors, variant keys and terms are
// left untouched. Dev and e2e only: run by `pnpm dev` and the vitest global
// setup, never by production builds; the output is gitignored.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(here, '../src/l10n/locales');
export const PSEUDO_LOCALE = 'en-XA';
const STRETCH = 0.35;

const ACCENTS = Object.fromEntries(
  [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [
    c,
    [...'áƀçðéƒĝĥíĵķļɱñóþǫŕšţúṽŵẋýžÁƁÇÐÉƑĜĤÍĴĶĻṀÑÓÞǪŔŠŢÚṼŴẊÝŽ'][i],
  ])
);

/** Index of the `}` that closes the placeable opened at `start`. */
function placeableEnd(line, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return line.length - 1;
}

/** Splits a pattern line into text runs and `{ … }` placeables. */
function segments(line) {
  const out = [];
  let pos = 0;
  let open = line.indexOf('{');
  while (open !== -1) {
    const close = placeableEnd(line, open);
    out.push(
      { text: line.slice(pos, open) },
      { placeable: line.slice(open, close + 1) }
    );
    pos = close + 1;
    open = line.indexOf('{', pos);
  }
  out.push({ text: line.slice(pos) });
  return out;
}

/**
 * Pseudo-localizes one line of pattern text. An indented continuation line may
 * not start with `[`, so its opening bracket is written as a string literal.
 */
export function pseudoText(line, continuation = false) {
  let visible = 0;
  const body = segments(line)
    .map((s) => {
      if (s.placeable !== undefined) return s.placeable;
      visible += s.text.length;
      return [...s.text].map((c) => ACCENTS[c] ?? c).join('');
    })
    .join('');
  const pad = '·'.repeat(Math.ceil(visible * STRETCH));
  return `${continuation ? '{"["}' : '['}${body}${pad}]`;
}

const ENTRY_ID = /^-?[a-zA-Z][\w-]*$/;

/** `"  x"` → `["  ", "x"]`. */
function splitLead(text) {
  const rest = text.trimStart();
  return [text.slice(0, text.length - rest.length), rest];
}

/** An `id = value` line, or null. */
function parseEntry(line) {
  const eq = line.indexOf('=');
  if (eq < 1) return null;
  const id = line.slice(0, eq).trimEnd();
  if (!ENTRY_ID.test(id)) return null;
  const [gap, value] = splitLead(line.slice(eq + 1));
  return { id, head: line.slice(0, eq + 1) + gap, value };
}

/** Length of a leading `.attr =`, `[key]` or `*[key]`; 0 if there is none. */
function keyLength(text) {
  if (text.startsWith('.')) return text.indexOf('=') + 1;
  if (text.startsWith('[') || text.startsWith('*[')) {
    return text.indexOf(']') + 1;
  }
  return 0;
}

/** An indented line of a message: continuation, variant or attribute. */
function pseudoIndented(line) {
  const [indent, text] = splitLead(line);
  if (text === '}' || text.includes('->')) return line;
  const keyLen = keyLength(text);
  if (!keyLen) return indent + pseudoText(text, true);
  const [gap, value] = splitLead(text.slice(keyLen));
  if (!value) return line;
  return indent + text.slice(0, keyLen) + gap + pseudoText(value);
}

/** Pseudo-localizes a whole .ftl source, line by line. */
export function pseudoLocalize(source) {
  let inMessage = false;
  return source
    .split('\n')
    .map((line) => {
      if (/^\s/.test(line)) {
        return inMessage && line.trim() ? pseudoIndented(line) : line;
      }
      const entry = parseEntry(line);
      // Terms are brand names and are never touched.
      inMessage = entry !== null && !entry.id.startsWith('-');
      return inMessage && entry.value
        ? entry.head + pseudoText(entry.value)
        : line;
    })
    .join('\n');
}

export function main() {
  const src = path.join(LOCALES_DIR, 'en-US');
  const out = path.join(LOCALES_DIR, PSEUDO_LOCALE);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const files = fs.readdirSync(src).filter((f) => f.endsWith('.ftl'));
  for (const file of files) {
    const source = fs.readFileSync(path.join(src, file), 'utf8');
    fs.writeFileSync(
      path.join(out, file),
      `# Generated from en-US by scripts/gen-pseudo-locale.mjs. Do not edit.\n` +
        pseudoLocalize(source)
    );
  }
  return files.length;
}

/** Vite dev-server plugin: regenerates en-XA whenever an en-US .ftl changes. */
export function pseudoLocalePlugin() {
  const source = path.join(LOCALES_DIR, 'en-US') + path.sep;
  return {
    name: 'l10n-pseudo-locale',
    apply: 'serve',
    configureServer(server) {
      server.watcher.on('all', (_event, file) => {
        if (file.startsWith(source) && file.endsWith('.ftl')) main();
      });
    },
  };
}

/** Vitest globalSetup entry: the l10n tests load the generated files. */
export default function setup() {
  main();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  console.log(`${PSEUDO_LOCALE}: ${main()} file(s)`);
}
