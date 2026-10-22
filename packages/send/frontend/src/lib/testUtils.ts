export function getByTestId(id) {
  return `[data-testid="${id}"]`;
}

type WebStorageName = 'localStorage' | 'sessionStorage';

/**
 * Simulates Firefox with "block all cookies" (network.cookie.cookieBehavior =
 * 2), where the named storage getters THROW a SecurityError instead of
 * returning a store. Returns a function that restores the originals.
 */
export function denyStorage(...names: ReadonlyArray<WebStorageName>) {
  const restores = names.map((name) => {
    const original = Object.getOwnPropertyDescriptor(window, name);
    Object.defineProperty(window, name, {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    return () => {
      if (original) {
        Object.defineProperty(window, name, original);
      } else {
        delete (window as Partial<Record<WebStorageName, Storage>>)[name];
      }
    };
  });
  return () => restores.forEach((restore) => restore());
}

/**
 * Simulates the token-bridge content script relaying `data` to the page.
 *
 * In a real browser `window.postMessage(data, window.location.origin)` delivers
 * an event with `source === window` and `origin === window.location.origin`,
 * which is what isTrustedBridgeMessage() checks. Under vitest's happy-dom
 * environment the `source` of a self-posted message is happy-dom's internal
 * GlobalWindow, not the `window` global the test and the app see, so a
 * postMessage-based simulation would be rejected by the guard. Dispatching the
 * MessageEvent directly with the real bridge's fields keeps the tests exercising
 * the production check.
 */
export function dispatchBridgeMessage(data: unknown) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin: window.location.origin,
      source: window,
    })
  );
}
