/**
 * Guards `public/manifest.json` against illegal WebExtension match patterns.
 *
 * A `*` is legal only as the entire host or as a leading `*.` subdomain
 * label -- `https://send-*.tb.pro/*` is not a pattern, it's a manifest
 * error. In `content_scripts[].matches` that error is fatal: Thunderbird
 * rejects the whole manifest rather than dropping the one entry, so the
 * add-on fails to install. In `permissions` it degrades quietly, dropping
 * the host permission with a warning. Both are worth catching here, since
 * nothing else in the repo validates the manifest.
 *
 * Validating the source manifest covers every shipped variant: `build.sh`
 * only strips localhost patterns from the built copy and the `set-*-id`
 * scripts only rewrite ids and icons. No build step ever adds a pattern.
 *
 * See issue #1095.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MANIFEST_PATH = resolve(__dirname, '../../public/manifest.json');

/** The host component of a `scheme://host/path` match pattern. */
function hostOf(pattern: string): string {
  return pattern.match(/^[a-z*]+:\/\/([^/]*)\//)?.[1] ?? '';
}

/** `*`, or an optional leading `*.` label followed by a wildcard-free host. */
const LEGAL_HOST = /^(\*|(\*\.)?[^*]+)$/;

describe('manifest.json match patterns', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

  const contentScriptPatterns: string[] = manifest.content_scripts.flatMap(
    (cs: { matches: string[] }) => cs.matches
  );
  // `permissions` mixes API permissions ("storage") with host patterns.
  const hostPermissions: string[] = manifest.permissions.filter((p: string) =>
    p.includes('://')
  );

  it('declares patterns to check', () => {
    expect(contentScriptPatterns.length).toBeGreaterThan(0);
    expect(hostPermissions.length).toBeGreaterThan(0);
  });

  it.each([
    ['content_scripts[].matches', () => contentScriptPatterns],
    ['host permissions', () => hostPermissions],
  ])('uses only legal wildcard placement in %s', (_label, patterns) => {
    expect(patterns().filter((p) => !LEGAL_HOST.test(hostOf(p)))).toEqual([]);
  });

  it('rejects the mid-host wildcard that broke #1095', () => {
    // Pin the rule itself, so a future loosening of LEGAL_HOST is visible.
    expect(LEGAL_HOST.test(hostOf('https://send-*.tb.pro/*'))).toBe(false);
    expect(LEGAL_HOST.test(hostOf('https://*.tb.pro/*'))).toBe(true);
    expect(LEGAL_HOST.test(hostOf('https://send-stage.tb.pro/*'))).toBe(true);
  });
});
