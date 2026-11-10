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

/** Splits a pattern line into text runs and `{ … }` placeables. */
function segments(line) {
  const out = [];
  let text = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '{') {
      text += line[i];
      continue;
    }
    out.push({ text });
    text = '';
    let depth = 0;
    let inString = false;
    let start = i;
    for (; i < line.length; i++) {
      const c = line[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    out.push({ placeable: line.slice(start, i + 1) });
  }
  out.push({ text });
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

/** Pseudo-localizes a whole .ftl source, line by line. */
export function pseudoLocalize(source) {
  let inMessage = false;
  return source
    .split('\n')
    .map((line) => {
      const entry = line.match(/^(-?[a-zA-Z][\w-]*)(\s*=\s*)(.*)$/);
      if (entry) {
        const [, id, eq, value] = entry;
        inMessage = !id.startsWith('-'); // terms are brand names: never touched
        return inMessage && value ? id + eq + pseudoText(value) : line;
      }
      if (!inMessage || !/^\s+\S/.test(line) || line.includes('->')) {
        if (!/^\s/.test(line)) inMessage = false;
        return line;
      }
      if (line.trim() === '}') return line;
      const keyed = line.match(/^(\s*(?:\.[\w-]+\s*=|\*?\[[^\]]+\])\s*)(.*)$/);
      if (keyed) return keyed[2] ? keyed[1] + pseudoText(keyed[2]) : line;
      const [, indent, text] = line.match(/^(\s+)(.*)$/);
      return indent + pseudoText(text, true);
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

/** Vitest globalSetup entry: the l10n tests load the generated files. */
export default function setup() {
  main();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  console.log(`${PSEUDO_LOCALE}: ${main()} file(s)`);
}
