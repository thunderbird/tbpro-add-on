/**
 * Shared setup/teardown glue for specs in this directory, so the same
 * `vi.resetModules()` / `createFakeThunderbirdHost()` / `vi.stubGlobal()`
 * boilerplate isn't repeated verbatim in every file. See README.md for what
 * the fake host itself simulates and why.
 */
import { resolve } from 'node:path';
import { vi } from 'vitest';
import {
  createFakeThunderbirdHost,
  type FakeBrowserContext,
  type FakeHost,
} from './fakeThunderbirdHost';

/** packages/addon, resolved once since every spec in this directory shares the same __dirname depth. */
export const ADDON_ROOT = resolve(__dirname, '../../..');

/** Call in beforeEach. Pass `fakeTimers: true` for specs that drive popupTimer/setTimeout races. */
export function setupHost(opts: { fakeTimers?: boolean } = {}): FakeHost {
  vi.resetModules();
  if (opts.fakeTimers) vi.useFakeTimers();
  return createFakeThunderbirdHost();
}

/** Pairs with setupHost(); call in afterEach with the same opts. */
export function teardownHost(opts: { fakeTimers?: boolean } = {}): void {
  vi.unstubAllGlobals();
  if (opts.fakeTimers) vi.useRealTimers();
}

/** Creates a context and stubs it as the global `browser`, ready for a module import that follows. */
export function stubContext(
  host: FakeHost,
  name = 'background'
): FakeBrowserContext {
  const ctx = host.createContext(name);
  vi.stubGlobal('browser', ctx.browser);
  return ctx;
}

/**
 * Deferred-resolution helper: lets a test hold an async call open (e.g. a
 * mocked folderStore.sync()) so two contexts' in-flight windows can be
 * forced to overlap deterministically.
 */
export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
