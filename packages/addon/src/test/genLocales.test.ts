import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMessages,
  folderFor,
  keyFor,
  LOCALES_DIR,
  manifestKeys,
} from '../../scripts/gen-locales.mjs';

const readLocale = (locale: string) =>
  fs
    .readdirSync(path.join(LOCALES_DIR, locale))
    .filter((f) => f.endsWith('.ftl'))
    .map((f) => fs.readFileSync(path.join(LOCALES_DIR, locale, f), 'utf8'));

const manifest = fs.readFileSync(
  path.resolve(__dirname, '../../public/manifest.json'),
  'utf8'
);

describe('gen-locales', () => {
  it('turns Fluent ids into messages.json keys', () => {
    expect(keyFor('addon-menu-sign-in-to')).toBe('menuSignInTo');
    expect(keyFor('addon-thunderbird-pro')).toBe('thunderbirdPro');
  });

  it('maps locales to _locales folder names', () => {
    expect(folderFor('en-US')).toBe('en');
    expect(folderFor('de')).toBe('de');
    expect(folderFor('pt-BR')).toBe('pt_BR');
  });

  it('formats terms, skips non-addon ids, and omits missing or empty messages', () => {
    const messages = buildMessages('de', [
      '-brand = Thundermail\n',
      'addon-a = Hallo { -brand }\naddon-empty = { "" }\naddon-var = { $x }\nsend-b = nope\n',
    ]);
    expect(messages).toEqual({ a: { message: 'Hallo Thundermail' } });
  });

  it('gives en-US every key the manifest references', () => {
    const messages = buildMessages('en-US', readLocale('en-US'));
    const keys = manifestKeys(manifest);
    expect(keys).toEqual(
      expect.arrayContaining([
        'thunderbirdPro',
        'extensionDescription',
        'thunderbirdSend',
      ])
    );
    for (const key of keys) expect(messages[key]?.message).toBeTruthy();
    expect(messages.thunderbirdPro.message).toBe('Thundermail');
  });

  it('keeps the nine messages the hand-written en file still uses', () => {
    expect(Object.keys(buildMessages('en-US', readLocale('en-US')))).toEqual(
      expect.arrayContaining([
        'extensionDescription',
        'thunderbirdPro',
        'thunderbirdSend',
        'menuSignInTo',
        'menuSignOut',
        'menuSignedInTooltip',
        'menuManageDashboard',
        'menuManageSend',
        'menuOpenAppointment',
      ])
    );
  });
});
