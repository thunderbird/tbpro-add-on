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
  resolveNextWindowCreate,
  type FakeBrowserContext,
  type FakeHost,
  type FakeWindow,
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
 * Drives background.ts's onFileUpload -> popupTimer(250ms) -> windows.create()
 * -> POPUP_READY handshake through to the point where FILE_LIST has been
 * sent, exactly as real Thunderbird + the real popup would. Requires
 * `setupHost({ fakeTimers: true })`.
 *
 * This is the "nothing goes wrong" path every happy-path upload spec needs
 * before it can assert its own thing (a specific FILE_LIST payload, an
 * add-password call, a second sequential session, etc.) -- the bug specs in
 * this directory each interrupt one particular step of this same sequence,
 * so they intentionally do NOT use this helper.
 */
export async function attachAndOpenPopup(
  host: FakeHost,
  bg: FakeBrowserContext,
  fileInfo: { id: number; name: string; data: any }
): Promise<{ upload: Promise<any>; popupWindow: FakeWindow }> {
  const upload = bg.triggerFileUpload(fileInfo);
  await vi.advanceTimersByTimeAsync(250);
  const popupWindow = resolveNextWindowCreate(host);
  await Promise.resolve(); // let popupWindowId assignment settle
  return { upload, popupWindow: popupWindow as FakeWindow };
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
