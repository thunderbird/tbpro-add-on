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

  /**
   * Without this permission Thunderbird strips the Send session cookie as soon
   * as third-party cookies are blocked -- see send/frontend/src/lib/cookieAccess.ts
   * for why. CORS lets the fetches through regardless, which is how it went
   * missing unnoticed. Bugzilla 2064458.
   */
  describe('Send backend host permission — Bugzilla 2064458', () => {
    it('grants a host permission for the production Send backend', () => {
      expect(hostPermissions).toContain('https://send-backend.tb.pro/*');
    });

    it('carries no port in any host permission, since Firefox silently drops such patterns', () => {
      // A host permission like `http://localhost:5173/*` is not a narrower
      // grant -- Firefox rejects the whole pattern (bug 1362809), so it grants
      // nothing. The dev localhost permissions below are portless on purpose;
      // this pins that they stay that way.
      expect(hostPermissions.filter((p) => /:\d+$/.test(hostOf(p)))).toEqual(
        []
      );
    });
  });

  /**
   * Local dev builds run the Send app from http(s)://localhost, so the add-on
   * needs a host permission for it -- portless, since a port makes the whole
   * pattern inert (bug 1362809). Kept out of shipped builds separately: prod
   * strips localhost from content_scripts in build.sh.
   */
  describe('localhost host permission — dev', () => {
    it('grants portless localhost host permissions for local development', () => {
      expect(hostPermissions).toContain('http://localhost/*');
      expect(hostPermissions).toContain('https://localhost/*');
    });
  });
});
