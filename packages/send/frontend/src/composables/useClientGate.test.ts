import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useClientGate } from './useClientGate';

const { query } = vi.hoisted(() => ({
  query: { data: null as unknown, error: null as unknown },
}));

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: { settings: { query: vi.fn() } },
}));
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({ data: ref(query.data), error: ref(query.error) }),
}));

function gateFor(clientGate: unknown, error: unknown = null) {
  query.data = { clientGate };
  query.error = error;
  return useClientGate().gate.value;
}

describe('useClientGate', () => {
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
