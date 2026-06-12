import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ADDON_ID_PROD, ADDON_ID_STAGE, ADDON_ID_SYSTEM } from '../addonIds';
import { setSystemId } from '../../scripts/set-system-id';

// A trimmed manifest with the gecko id nested where the real one lives.
const manifestWithId = (id: string) =>
  JSON.stringify(
    {
      manifest_version: 2,
      browser_specific_settings: { gecko: { id } },
      background: { scripts: ['background.mjs'], type: 'module' },
    },
    null,
    2
  );

let tmpDir: string;
let manifestPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'set-system-id-'));
  manifestPath = path.join(tmpDir, 'manifest.json');
  // Keep the console quiet for the success path.
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('setSystemId', () => {
  it('rewrites the prod id to the system id in place', () => {
    fs.writeFileSync(manifestPath, manifestWithId(ADDON_ID_PROD));

    setSystemId(manifestPath);

    const result = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(result.browser_specific_settings.gecko.id).toBe(ADDON_ID_SYSTEM);
  });

  it('leaves the rest of the manifest untouched', () => {
    fs.writeFileSync(manifestPath, manifestWithId(ADDON_ID_PROD));

    setSystemId(manifestPath);

    const result = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(result.manifest_version).toBe(2);
    expect(result.background).toEqual({
      scripts: ['background.mjs'],
      type: 'module',
    });
  });

  it('throws and does not modify the file when the prod id is absent', () => {
    const original = manifestWithId(ADDON_ID_STAGE);
    fs.writeFileSync(manifestPath, original);

    expect(() => setSystemId(manifestPath)).toThrow(/Could not find prod id/);
    // File is left exactly as it was.
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(original);
  });

  it('is a no-op-safe guard against a manifest already on the system id', () => {
    // The system id is not the prod id, so a re-run finds nothing to replace
    // and throws rather than silently passing.
    fs.writeFileSync(manifestPath, manifestWithId(ADDON_ID_SYSTEM));

    expect(() => setSystemId(manifestPath)).toThrow(/Could not find prod id/);
  });

  it('throws when the manifest file does not exist', () => {
    expect(() =>
      setSystemId(path.join(tmpDir, 'does-not-exist.json'))
    ).toThrow();
  });
});
