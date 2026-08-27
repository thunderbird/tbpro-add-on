/**
 * Minimal in-memory `localStorage` for tests.
 *
 * The vitest environment used here does not wire up a real `localStorage`
 * (see the note in keychain.restore-race.test.ts), so suites that exercise
 * LocalStorageAdapter-backed code install this shim. Values are kept as
 * strings, mirroring the real Web Storage API's serialisation behavior.
 */
export function installLocalStorageMock(): void {
  const store = new Map<string, string>();

  const mock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    configurable: true,
    writable: true,
  });
}
