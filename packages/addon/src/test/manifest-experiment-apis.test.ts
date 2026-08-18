/**
 * Guards `public/manifest.json`'s `experiment_apis` against drifting away from
 * the implementation scripts and schemas it points at.
 *
 * Gecko resolves an experiment API module by its *manifest key*: `loadModule()`
 * returns `this.global[key]` from the sandbox the script ran in, then
 * `asyncGetAPI()` does `new module(extension)`. If the script exports a
 * different symbol, that's `new undefined(...)` -- "module is not a
 * constructor" at startup, and the parent-side implementation is never
 * installed. The schema-generated stubs still appear on `browser`, so the
 * add-on's own `?.` availability guards don't notice; calls just reject and the
 * telemetry gate silently fails closed. That was bug 2055585, where
 * `api/Telemetry/implementation.js` exported `Telemetry` while the manifest key
 * was `thundermailTelemetry`.
 *
 * A schema namespace that isn't listed in `parent.paths` fails the same way
 * from the other direction: nothing triggers the lazy parent load, so the
 * namespace is dead. (A path with no matching namespace is harmless -- that's
 * how startup-only APIs like ProTweaks, whose schema is empty, are declared.)
 *
 * Validating the source manifest covers every shipped variant: `build.sh` and
 * the `set-*-id` scripts only rewrite ids, icons and localhost match patterns,
 * never `experiment_apis`.
 *
 * See https://bugzilla.mozilla.org/show_bug.cgi?id=2055585, and
 * `manifest-match-patterns.test.ts` for the sibling manifest guard.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = resolve(__dirname, '../../public');
const MANIFEST_PATH = resolve(PUBLIC_DIR, 'manifest.json');

type ExperimentApi = {
  schema: string;
  parent: { script: string; paths: string[][] };
};

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
const apis: [string, ExperimentApi][] = Object.entries(
  manifest.experiment_apis as Record<string, ExperimentApi>
);

describe('manifest.json experiment_apis', () => {
  it('declares APIs to check', () => {
    expect(apis.length).toBeGreaterThan(0);
  });

  describe.each(apis)('%s', (name, api) => {
    it('points at an implementation script that exists', () => {
      expect(existsSync(resolve(PUBLIC_DIR, api.parent.script))).toBe(true);
    });

    it('exports a symbol named after the manifest key', () => {
      const source = readFileSync(
        resolve(PUBLIC_DIR, api.parent.script),
        'utf-8'
      );
      // `exports.Foo = Foo;` and `exports.Foo = class extends ...` both count.
      expect(source).toMatch(new RegExp(`\\bexports\\.${name}\\s*=`));
    });

    it('points at a schema that exists', () => {
      expect(existsSync(resolve(PUBLIC_DIR, api.schema))).toBe(true);
    });

    it('routes every schema namespace through parent.paths', () => {
      const schema = JSON.parse(
        readFileSync(resolve(PUBLIC_DIR, api.schema), 'utf-8')
      ) as { namespace?: string }[];
      const paths = api.parent.paths.map((path) => path.join('.'));

      for (const { namespace } of schema) {
        expect(paths).toContain(namespace);
      }
    });
  });
});
