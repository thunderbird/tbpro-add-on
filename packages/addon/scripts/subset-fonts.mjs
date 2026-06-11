// Subset the webfonts shipped with the add-on down to a Latin glyph set.
//
// The send-frontend webfonts (Inter, Metropolis) carry the full extended glyph
// set, ~3 MB total. This add-on's UI is English (`default_locale: en`) and its
// chrome text is Latin, so we ship a Latin + Latin-Extended-A + punctuation
// subset instead. That keeps the @font-face url()s resolvable (so Thunderbird's
// static browser_parsable_css.js check passes — Bug 2036665) while cutting the
// bundled fonts by ~75%. User-supplied text outside this range simply falls
// back to the system font in the add-on UI; the full-coverage fonts still ship
// with the standalone web app.
//
// Only .woff2 is emitted — the CSS no longer references the legacy .woff
// fallbacks (Thunderbird is modern Gecko with universal woff2 support).

import subsetFont from 'subset-font';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(here, '..', 'node_modules', 'send-frontend', 'public', 'fonts');
const OUT_DIR = join(here, '..', 'dist', 'fonts');

// Codepoint ranges to retain. Mirrors a typical "latin" + "latin-ext" subset:
// Basic Latin, Latin-1 Supplement, Latin Extended-A, General Punctuation
// (smart quotes, dashes, ellipsis), and currency symbols, plus the trademark
// sign. Keep these generous enough to cover Western/Central European names.
const RANGES = [
  [0x0020, 0x007e],
  [0x00a0, 0x00ff],
  [0x0100, 0x017f],
  [0x2000, 0x206f],
  [0x20a0, 0x20bf],
  [0x2122, 0x2122],
];

function retainText() {
  let s = '';
  for (const [a, b] of RANGES) {
    for (let c = a; c <= b; c++) s += String.fromCodePoint(c);
  }
  return s;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const text = retainText();
const files = walk(SRC_DIR);
let originalBytes = 0;
let subsetBytes = 0;
let count = 0;

for (const file of files) {
  const rel = relative(SRC_DIR, file);
  const dest = join(OUT_DIR, rel);
  mkdirSync(dirname(dest), { recursive: true });

  if (file.endsWith('.woff2')) {
    const buf = readFileSync(file);
    const subset = await subsetFont(buf, text, { targetFormat: 'woff2' });
    writeFileSync(dest, subset);
    originalBytes += buf.length;
    subsetBytes += subset.length;
    count++;
  } else if (file.endsWith('.woff')) {
    // Skip legacy .woff — no longer referenced by the CSS.
    continue;
  } else {
    // Preserve license / metadata files verbatim.
    copyFileSync(file, dest);
  }
}

const kb = (n) => (n / 1024).toFixed(0);
console.log(
  `Subset ${count} woff2 fonts: ${kb(originalBytes)} KB -> ${kb(subsetBytes)} KB ` +
    `(${(100 * (1 - subsetBytes / originalBytes)).toFixed(0)}% smaller)`
);
