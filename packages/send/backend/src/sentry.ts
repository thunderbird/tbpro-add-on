// Sentry Node SDK v10 (OpenTelemetry 2.x). This module must be the FIRST thing
// src/index.ts imports: the SDK instruments express, http, pg, ioredis, etc. by
// hooking their `require`, so anything required before Sentry.init() runs is
// invisible to tracing. Compiled as CommonJS, so plain import order is enough
// (no `--import ./instrument.js` needed).
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import 'dotenv/config';
import { ENVIRONMENT, getEnvironmentName, VERSION } from './config';

const TRACING_LEVELS_PROD = ['error', 'warn'];
const TRACING_LEVELS_DEV = ['error', 'warn', 'debug'];

const isProduction = ENVIRONMENT === 'production';

const ignoredTraces = [{ method: 'GET', endpoint: '/' }];

const excludedUserAgents = ['headless', 'elb'];

// Ignore events from health checks and headless browsers
const hasExcludedUserAgent = (headers: Record<string, string | undefined>) => {
  const userAgent = (
    headers['user-agent'] ||
    headers['User-Agent'] ||
    ''
  ).toLowerCase();
  return excludedUserAgents.some((agent) => userAgent.includes(agent));
};

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
    Sentry.captureConsoleIntegration({
      levels: isProduction ? TRACING_LEVELS_PROD : TRACING_LEVELS_DEV,
    }),
  ],
  // Performance Monitoring
  environment: process.env.NODE_ENV || 'development',
  beforeSendTransaction: (event) => {
    // Root spans that did not come from an HTTP request carry no `request`.
    if (hasExcludedUserAgent(event.request?.headers ?? {})) {
      return null;
    }
    return event;
  },
  tracesSampleRate: 0.5,
  tracesSampler: (samplingContext) => {
    const shouldTrace = !ignoredTraces.some(
      ({ endpoint }) => samplingContext?.attributes['http.route'] === endpoint
    );

    return shouldTrace;
  },

  // Profiling. v10 deprecates the transaction-based `profilesSampleRate` in
  // favour of profile sessions; `profileLifecycle: 'trace'` profiles whenever a
  // sampled root span is active, so with a session rate of 1.0 every sampled
  // trace is profiled, which is what `profilesSampleRate: 1.0` did before.
  profileSessionSampleRate: 1.0,
  profileLifecycle: 'trace',
  release: VERSION,
});

Sentry.setTag('environmentName', getEnvironmentName());

console.log('Sentry initialized with env: ' + ENVIRONMENT);
console.log('Sentry is using release version: ' + VERSION);
