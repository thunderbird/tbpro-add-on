/**
 * Guards `src/env.d.ts` against drifting away from the experiment API schemas
 * reachable from `public/manifest.json`.
 *
 * Those schemas are the contract; `env.d.ts` is the only thing that type-checks
 * our calls against it. When the two drift, TypeScript stops helping silently:
 * `MailAccounts` was never declared at all, so both call sites in
 * `background.ts` were errors we had learned to ignore, and `TBProMenu.remove`
 * existed in the schema and implementation but nowhere in `env.d.ts`, so
 * nothing noticed it had no callers.
 *
 * The namespace and schema sets are compared both ways, so a declaration that
 * outlives its schema fails too, and a schema directory the manifest never
 * references cannot hide from both this guard and its sibling.
 *
 * An API whose schema declares no namespace (ProTweaks, which exists only for
 * its startup side effects) has nothing to declare and is skipped.
 *
 * Events are matched by their inline-object-type form (`const onFoo: {`), which
 * is how all three are written today; a refactor to a named event type would
 * need this matcher updated.
 *
 * See `manifest-experiment-apis.test.ts` for the sibling guard covering the
 * manifest/schema/implementation wiring.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = resolve(__dirname, '../../public');
const ENV_TYPES = readFileSync(resolve(__dirname, '../env.d.ts'), 'utf-8');

type SchemaNamespace = {
  namespace: string;
  functions?: { name: string }[];
  events?: { name: string }[];
};

const manifest = JSON.parse(
  readFileSync(resolve(PUBLIC_DIR, 'manifest.json'), 'utf-8')
);

const schemaPaths = Object.values(
  manifest.experiment_apis as Record<string, { schema: string }>
).map((api) => api.schema);

const namespaces: SchemaNamespace[] = schemaPaths.flatMap((schema) =>
  JSON.parse(readFileSync(resolve(PUBLIC_DIR, schema), 'utf-8'))
);

/**
 * The body of `namespace <name> { ... }` in env.d.ts, or null if undeclared.
 *
 * Scoping matters: two namespaces declare a `createAccount`, so an unscoped
 * search would pass even after one of them lost its declaration.
 */
function declarationOf(name: string): string | null {
  const start = ENV_TYPES.indexOf(`namespace ${name} {`);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  for (let i = ENV_TYPES.indexOf('{', start); i < ENV_TYPES.length; i++) {
    if (ENV_TYPES[i] === '{') {
      depth++;
    } else if (ENV_TYPES[i] === '}' && --depth === 0) {
      const block = ENV_TYPES.slice(start, i);

      // Brace counting is fooled by an unbalanced brace in a string or comment.
      // An extra `}` only truncates the block, which fails loudly; an extra `{`
      // swallows the next sibling and would let this guard pass on a namespace
      // it never actually read. Catch that direction explicitly.
      if (/\bnamespace \w+ \{/.test(block.slice(block.indexOf('{') + 1))) {
        throw new Error(
          `Extraction for ${name} swallowed a sibling namespace; check for an unbalanced brace in a comment or string.`
        );
      }

      return block;
    }
  }

  throw new Error(`Unbalanced braces in declaration of ${name}`);
}

describe('env.d.ts experiment API declarations', () => {
  it('has namespaces to check', () => {
    expect(namespaces.length).toBeGreaterThan(0);
  });

  it('declares every namespace a schema backs, and no others', () => {
    const declared = [...ENV_TYPES.matchAll(/\bnamespace (\w+) \{/g)]
      .map(([, name]) => name)
      .filter((name) => name !== 'browser');

    expect(declared.sort()).toEqual(
      namespaces.map(({ namespace }) => namespace).sort()
    );
  });

  it('has no schema directory the manifest does not reference', () => {
    const onDisk = readdirSync(resolve(PUBLIC_DIR, 'api'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `api/${entry.name}/schema.json`);

    expect(schemaPaths.sort()).toEqual(onDisk.sort());
  });

  describe.each(namespaces.map((ns) => [ns.namespace, ns] as const))(
    '%s',
    (name, schema) => {
      const declaration = declarationOf(name);

      it('is declared in env.d.ts', () => {
        expect(declaration).not.toBeNull();
      });

      it.each((schema.functions ?? []).map(({ name }) => name))(
        'declares function %s',
        (fn) => {
          expect(declaration).toContain(`function ${fn}(`);
        }
      );

      it.each((schema.events ?? []).map(({ name }) => name))(
        'declares event %s',
        (event) => {
          expect(declaration).toContain(`const ${event}: {`);
        }
      );
    }
  );
});
