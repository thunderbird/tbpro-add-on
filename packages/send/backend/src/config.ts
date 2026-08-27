import 'dotenv/config';
import fs from 'fs';
import path from 'path';

type Environment = 'development' | 'production';
export type EnvironmentName = 'stage' | 'prod' | 'development';

export const TRPC_WS_PATH = `/trpc/ws`;

const ONE_KB_IN_BYTES = 1000;
const ONE_MB_IN_BYTES = ONE_KB_IN_BYTES * 1000;
const ONE_GB_IN_BYTES = ONE_MB_IN_BYTES * 1000;

const appConfig = {
  file_dir: `/tmp/send-suite-dev-dir`,
  max_file_size: ONE_GB_IN_BYTES * 20, // 20 GB
};

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
);

export const VERSION = packageJson.version as string;

const ENVIRONMENT = process.env.NODE_ENV || ('development' as Environment);
const BASE_URL = process.env.BASE_URL;

export const IS_ENV_DEV = ENVIRONMENT === 'development';
export const IS_ENV_PROD = ENVIRONMENT === 'production';
export const IS_ENV_TEST = process.env.NODE_ENV === 'test';

// Time constants
const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = ONE_MINUTE * 60;
const ONE_DAY = 1;
const ONE_WEEK = ONE_DAY * 7;

// File expiry time in days
export const DAYS_TO_EXPIRY = 15;

// We're not enforcing the limit right now, we only use it to display a value on the frontend
const ONE_TB_IN_BYTES = 1 * 1_000 * 1_000 * 1_000 * 1_000; // 1 TB (roughly)
export const TOTAL_STORAGE_LIMIT = ONE_TB_IN_BYTES;

// JWT expiry
export const JWT_EXPIRY_IN_MILLISECONDS = ONE_HOUR;
export const JWT_REFRESH_TOKEN_EXPIRY_IN_DAYS = ONE_WEEK;

// Determines how many times a file can be attempted to be downloaded with the wrong password before it gets locked
export const MAX_ACCESS_LINK_RETRIES = 5;

// Response header that tells the client its session is gone and it should clear
// local auth and return to login (#960). Lives here (a dependency-light module)
// so both the Express middleware and the tRPC middleware can import it without
// pulling in the heavier models/prisma graph.
export const X_LOGOUT_HEADER = 'x-logout';

export function getEnvironmentName(): EnvironmentName {
  if (BASE_URL.includes('send-backend.tb.pro')) {
    return 'prod';
  }
  if (BASE_URL.includes('send-backend-stage.tb.pro')) {
    return 'stage';
  }
  return 'development';
}

export { ENVIRONMENT };

// --- Rate limiting -----------------------------------------------------------
//
// One named tier per kind of endpoint, so every route picks a limit by name
// rather than repeating numbers. Limits are per user, per window, counted in
// Redis so they hold across all backend instances.
//
// The defaults below sit well above what a normal user session does and are
// meant to stop scripted abuse, not throttle real use. Each value can be tuned
// from real traffic after rollout via the RL_* env vars, without a code change.
//
//   auth      tightest  — pre-auth / credential paths (e.g. token refresh)
//   read      loosest   — high-frequency GETs
//   sensitive middle    — state-changing actions (create / delete / share)
export type RateLimitTier = 'auth' | 'read' | 'sensitive';

const RATE_LIMIT_WINDOW_MS = ONE_MINUTE;

function rateLimitFromEnv(
  tier: RateLimitTier,
  defaultMax: number
): { windowMs: number; max: number } {
  const maxOverride = Number(process.env[`RL_${tier.toUpperCase()}_MAX`]);
  const windowOverride = Number(
    process.env[`RL_${tier.toUpperCase()}_WINDOW_MS`]
  );
  return {
    max:
      Number.isFinite(maxOverride) && maxOverride > 0
        ? maxOverride
        : defaultMax,
    windowMs:
      Number.isFinite(windowOverride) && windowOverride > 0
        ? windowOverride
        : RATE_LIMIT_WINDOW_MS,
  };
}

export const RATE_LIMITS: Record<
  RateLimitTier,
  { windowMs: number; max: number }
> = {
  auth: rateLimitFromEnv('auth', 10),
  read: rateLimitFromEnv('read', 100),
  sensitive: rateLimitFromEnv('sensitive', 30),
};

export default appConfig;
