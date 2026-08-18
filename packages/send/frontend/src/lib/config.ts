/**
 * Build-time environment name, for callers that run in Node and therefore cannot
 * use `src/config.ts` (which reads `import.meta.env` and `window`). The only such
 * caller is `vite.config.js`, which tags the Sentry release with it.
 *
 * At RUNTIME use `config.appEnv` from `@send-frontend/config` instead.
 *
 * This used to derive the answer from `BASE_URL.includes('https://send.tb.pro')`,
 * which was wrong twice over: a substring of a URL is a two-valued switch that
 * cannot express a third environment (e.g. tb-dev), and `import.meta.env.BASE_URL`
 * is Vite's own base path ('/'), never a site URL -- so the production branch
 * never actually fired. The environment is now stated explicitly, via
 * VITE_APP_ENV / APP_ENV.
 *
 * @param envVarObject - env bag: `process.env`, or the `loadEnv()` result when
 *   called from vite.config. Required, as before.
 *
 *   NOTE for the `loadEnv()` case: it returns ONLY `VITE_`-prefixed keys, so
 *   neither `NODE_ENV` nor `MODE` is in it and the mode fallback below would be
 *   unreachable. vite.config.js therefore merges `MODE` in at the call site.
 * @returns the declared environment name, or a mode-derived non-production
 *   fallback (`development`/`staging`) when none is declared
 */
export const getEnvironmentName = (
  envVarObject: Record<string, string | undefined>
): string => {
  if (!envVarObject) {
    throw new Error('Environment variables object is required');
  }

  const declared = envVarObject.VITE_APP_ENV || envVarObject.APP_ENV;
  if (declared) {
    return declared;
  }

  // Nothing declared: fall back to a NON-production name, mirroring
  // `resolveAppEnv()` in src/config.ts (so the Sentry release metadata and the
  // runtime `environment` tag agree) -- see the fail-safe rationale there.
  // `staging` is also what this function returned for an undeclared non-dev
  // build before the refactor.
  return (envVarObject.NODE_ENV || envVarObject.MODE) === 'development'
    ? 'development'
    : 'staging';
};

export const TRPC_WS_PATH = `/trpc/ws`;
