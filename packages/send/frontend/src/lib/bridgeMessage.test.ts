import { describe, expect, it, vi } from 'vitest';
import { isTrustedBridgeMessage, onBridgeMessage } from './bridgeMessage';

/** Builds a MessageEvent the way the token-bridge content script would. */
function bridgeEvent(
  data: unknown,
  overrides: Partial<{ origin: string; source: MessageEventSource | null }> = {}
) {
  return new MessageEvent('message', {
    data,
    origin: window.location.origin,
    source: window,
    ...overrides,
  });
}

describe('isTrustedBridgeMessage', () => {
  it('accepts a message the page posted to itself (the bridge relay path)', () => {
    expect(isTrustedBridgeMessage(bridgeEvent({ type: 'X' }))).toBe(true);
  });

  // Not tested here: a real `window.postMessage(data, window.location.origin)`
  // round trip. In a browser it yields source === window (UserMenu.vue and the
  // bridge itself already rely on that in production); under happy-dom the
  // event's source is an internal window object distinct from the `window`
  // global, so tests simulate the bridge with dispatchBridgeMessage() instead.

  it('rejects a message from another origin', () => {
    expect(
      isTrustedBridgeMessage(
        bridgeEvent({ type: 'X' }, { origin: 'https://evil.example' })
      )
    ).toBe(false);
  });

  it('rejects a message whose origin is empty (opaque / sandboxed sender)', () => {
    expect(
      isTrustedBridgeMessage(bridgeEvent({ type: 'X' }, { origin: '' }))
    ).toBe(false);
  });

  it('rejects a same-origin message from a different window (frame or popup)', () => {
    const otherWindow = {} as unknown as Window;
    expect(
      isTrustedBridgeMessage(
        bridgeEvent({ type: 'X' }, { source: otherWindow })
      )
    ).toBe(false);
  });

  it('rejects a message with no source', () => {
    expect(
      isTrustedBridgeMessage(bridgeEvent({ type: 'X' }, { source: null }))
    ).toBe(false);
  });
});

describe('onBridgeMessage', () => {
  it('invokes the handler only for trusted messages', () => {
    const handler = vi.fn();
    const listener = onBridgeMessage(handler);

    listener(bridgeEvent({ type: 'X' }, { origin: 'https://evil.example' }));
    listener(bridgeEvent({ type: 'X' }, { source: {} as unknown as Window }));
    expect(handler).not.toHaveBeenCalled();

    const trusted = bridgeEvent({ type: 'X' });
    listener(trusted);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(trusted);
  });

  it('returns a stable function usable with removeEventListener', () => {
    const handler = vi.fn();
    const listener = onBridgeMessage(handler);
    window.addEventListener('message', listener);
    window.removeEventListener('message', listener);
    window.dispatchEvent(bridgeEvent({ type: 'X' }));
    expect(handler).not.toHaveBeenCalled();
  });
});
