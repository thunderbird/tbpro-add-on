import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gateSentryOnTelemetry } from '../sentryGate';

const sentry = vi.hoisted(() => ({
  initSentry: vi.fn(),
  closeSentry: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@send-frontend/lib/sentry', () => sentry);

type Listener = (enabled: boolean) => void;

function stubTelemetry(isTelemetryEnabled: () => Promise<boolean>) {
  const listeners: Listener[] = [];
  vi.stubGlobal('browser', {
    thundermailTelemetry: {
      isTelemetryEnabled: vi.fn(isTelemetryEnabled),
      onChanged: { addListener: (cb: Listener) => listeners.push(cb) },
    },
  });
  return (enabled: boolean) => listeners.forEach((cb) => cb(enabled));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('gateSentryOnTelemetry', () => {
  it.each([
    ['without an app (background)', undefined],
    ['with the page app', { name: 'popup' } as never],
  ])('starts Sentry %s when telemetry is enabled', async (_label, app) => {
    stubTelemetry(async () => true);
    await gateSentryOnTelemetry(app);
    expect(sentry.initSentry).toHaveBeenCalledOnce();
    expect(sentry.initSentry).toHaveBeenCalledWith(app);
  });

  it('keeps Sentry off when telemetry is disabled', async () => {
    stubTelemetry(async () => false);
    await gateSentryOnTelemetry();
    expect(sentry.initSentry).not.toHaveBeenCalled();
  });

  it('stops on onChanged(false) and starts on onChanged(true)', async () => {
    const emit = stubTelemetry(async () => true);
    await gateSentryOnTelemetry();
    sentry.initSentry.mockClear();

    emit(false);
    expect(sentry.closeSentry).toHaveBeenCalledOnce();
    expect(sentry.initSentry).not.toHaveBeenCalled();

    emit(true);
    expect(sentry.initSentry).toHaveBeenCalledOnce();
  });

  it('lets a change during the initial read win over the stale result', async () => {
    let resolveRead!: (v: boolean) => void;
    const emit = stubTelemetry(
      () => new Promise<boolean>((r) => (resolveRead = r))
    );
    const done = gateSentryOnTelemetry();
    emit(false);
    resolveRead(true);
    await done;
    expect(sentry.initSentry).not.toHaveBeenCalled();
  });

  it('fails closed when the telemetry read throws', async () => {
    stubTelemetry(async () => {
      throw new Error('boom');
    });
    await expect(gateSentryOnTelemetry()).resolves.toBeUndefined();
    expect(sentry.initSentry).not.toHaveBeenCalled();
  });

  it('fails closed when the telemetry API is missing', async () => {
    vi.stubGlobal('browser', {});
    await expect(gateSentryOnTelemetry()).resolves.toBeUndefined();
    expect(sentry.initSentry).not.toHaveBeenCalled();
  });

  it('fails closed when `browser` is undefined', async () => {
    vi.stubGlobal('browser', undefined);
    await expect(gateSentryOnTelemetry()).resolves.toBeUndefined();
    expect(sentry.initSentry).not.toHaveBeenCalled();
  });
});
