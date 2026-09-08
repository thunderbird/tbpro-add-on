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
