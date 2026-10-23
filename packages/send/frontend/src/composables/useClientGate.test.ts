import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useClientGate } from './useClientGate';

const { query, settingsQuery, config } = vi.hoisted(() => ({
  query: { data: null, error: null } as {
    data: unknown;
    error: unknown;
    options?: { queryFn: () => Promise<unknown> };
  },
  settingsQuery: vi.fn(),
  config: { isThunderbirdHost: false },
}));

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: { settings: { query: settingsQuery } },
}));
vi.mock('@tanstack/vue-query', () => ({
  useQuery: (options: typeof query.options) => {
    query.options = options;
    return { data: ref(query.data), error: ref(query.error) };
  },
}));
vi.mock('@send-frontend/apps/send/stores/config-store', () => ({
  useConfigStore: () => config,
}));

function gateFor(clientGate: unknown, error: unknown = null) {
  query.data = { clientGate };
  query.error = error;
  return useClientGate().gate.value;
}

describe('useClientGate', () => {
  beforeEach(() => {
    settingsQuery.mockClear();
    config.isThunderbirdHost = false;
  });

  it.each([
    [true, 'thunderbird'],
    [false, 'browser'],
  ])(
    'tells the server where it runs (Thunderbird host: %s)',
    async (isThunderbirdHost, runtime) => {
      config.isThunderbirdHost = isThunderbirdHost;
      useClientGate();
      await query.options?.queryFn();
      expect(settingsQuery).toHaveBeenCalledWith({
        version: __APP_VERSION__,
        appName: __APP_NAME__,
        runtime,
      });
    }
  );

  it('passes through string title and message', () => {
    expect(
      gateFor({
        action: 'block',
        minVersion: '9.9.9',
        title: 'T',
        message: 'M',
      })
    ).toEqual({
      action: 'block',
      minVersion: '9.9.9',
      title: 'T',
      message: 'M',
    });
  });

  it.each([
    ['missing', {}],
    ['null', { title: null, message: null }],
    ['non-string', { title: 1, message: ['x'] }],
  ])('treats %s text as absent', (_, text) => {
    expect(gateFor({ action: 'banner', ...text })).toMatchObject({
      title: null,
      message: null,
    });
  });

  it('is none with no text when the request failed', () => {
    expect(
      gateFor({ action: 'block', title: 'T', message: 'M' }, new Error('x'))
    ).toEqual({ action: 'none', minVersion: null, title: null, message: null });
  });
});
