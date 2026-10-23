import { getClientGateEnv } from '@send-backend/config';
import { logger } from './logger';

export type ClientGateAction = 'none' | 'banner' | 'block';

/** Where the client runs, as reported in the `settings` query. */
export const CLIENT_RUNTIMES = ['thunderbird', 'browser'] as const;
export type ClientRuntime = (typeof CLIENT_RUNTIMES)[number];

export type ClientGate = {
  action: ClientGateAction;
  minVersion: string | null;
  /** Plain text; clients render it as text, never HTML. */
  title: string | null;
  message: string | null;
};

export type LegacyCompatibilityResult =
  | 'COMPATIBLE'
  | 'PROMPT_UPDATE'
  | 'FORCE_UPDATE';

type ParsedVersion = { core: number[]; prerelease: string[] };

const NUMERIC = /^\d+$/;
const IDENTIFIER = /^[0-9A-Za-z-]+$/;

/** `MAJOR.MINOR.PATCH[-pre][+build]` (optional leading `v`), else null. */
export function parseSemver(version: unknown): ParsedVersion | null {
  if (typeof version !== 'string') {
    return null;
  }
  const parts = version.trim().replace(/^v/, '').split('+');
  const withoutBuild = parts[0];
  // Build metadata is ignored for precedence but must still be well-formed.
  const build = parts.length > 1 ? parts[1].split('.') : [];
  if (parts.length > 2 || !build.every((part) => IDENTIFIER.test(part))) {
    return null;
  }
  const dash = withoutBuild.indexOf('-');
  const coreText = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const core = coreText.split('.');
  const prerelease = dash === -1 ? [] : withoutBuild.slice(dash + 1).split('.');
  if (
    core.length !== 3 ||
    !core.every((part) => NUMERIC.test(part)) ||
    !prerelease.every((part) => IDENTIFIER.test(part))
  ) {
    return null;
  }
  return { core: core.map(Number), prerelease };
}

function compareIdentifiers(a: string, b: string): number {
  const aNumeric = NUMERIC.test(a);
  const bNumeric = NUMERIC.test(b);
  if (aNumeric && bNumeric) {
    return Math.sign(Number(a) - Number(b));
  }
  if (aNumeric !== bNumeric) {
    return aNumeric ? -1 : 1;
  }
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Semver precedence (build metadata ignored): -1, 0 or 1. */
export function compareSemver(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < a.core.length; i++) {
    if (a.core[i] !== b.core[i]) {
      return Math.sign(a.core[i] - b.core[i]);
    }
  }
  // A pre-release sorts before its release: 2.1.0-beta < 2.1.0.
  if (!a.prerelease.length || !b.prerelease.length) {
    return Math.sign(b.prerelease.length - a.prerelease.length);
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    if (a.prerelease[i] === undefined) return -1;
    if (b.prerelease[i] === undefined) return 1;
    const result = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (result !== 0) {
      return result;
    }
  }
  return 0;
}

// Warn once per distinct bad value, not on every settings request.
const warnedConfig = new Set<string>();
function warnInvalidConfig(key: string, value: string) {
  const id = `${key}=${value}`;
  if (warnedConfig.has(id)) {
    return;
  }
  warnedConfig.add(id);
  logger.warn(`Ignoring invalid ${key}="${value}"; client gate is off.`);
}

export function resetClientGateWarnings() {
  warnedConfig.clear();
}

const NO_GATE: ClientGate = {
  action: 'none',
  minVersion: null,
  title: null,
  message: null,
};

const text = (value: string | undefined) => value?.trim() || null;

/**
 * Server-controlled update gate. `none` unless a valid minimum is configured
 * for the client type and the client's version is below it.
 */
export function getClientGate(
  clientVersion: string,
  appName: string | null | undefined
): ClientGate {
  const env = getClientGateEnv();
  const isAddon = Boolean(appName?.includes('addon'));
  const minKey = isAddon
    ? 'CLIENT_MIN_VERSION_ADDON'
    : 'CLIENT_MIN_VERSION_WEB';
  const app = isAddon ? env.addon : env.web;
  const minVersion = app.minVersion?.trim();

  if (!minVersion) {
    return NO_GATE;
  }
  const min = parseSemver(minVersion);
  if (!min) {
    warnInvalidConfig(minKey, minVersion);
    return NO_GATE;
  }

  const mode = env.mode?.trim() || 'banner';
  if (mode !== 'banner' && mode !== 'block') {
    warnInvalidConfig('CLIENT_GATE_MODE', mode);
    return NO_GATE;
  }

  // An unparseable client version is client input, not config: fail open.
  const client = parseSemver(clientVersion);
  if (!client || compareSemver(client, min) >= 0) {
    return { ...NO_GATE, minVersion };
  }

  // Per-app text wins over the deprecated generic message; unset → null.
  return {
    action: mode,
    minVersion,
    title: text(app.title),
    message: text(app.message) ?? text(env.message),
  };
}

/** The `compatibility.result` value that clients without `clientGate` read. */
export function toLegacyCompatibilityResult(
  action: ClientGateAction
): LegacyCompatibilityResult {
  if (action === 'block') return 'FORCE_UPDATE';
  if (action === 'banner') return 'PROMPT_UPDATE';
  return 'COMPATIBLE';
}
