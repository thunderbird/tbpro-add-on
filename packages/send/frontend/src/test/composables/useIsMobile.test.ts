import {
  MOBILE_MEDIA_QUERY,
  useIsMobile,
} from '@send-frontend/composables/useIsMobile';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

type ChangeListener = (event: { matches: boolean }) => void;

/**
 * Controllable `window.matchMedia` stub. The real breakpoint plumbing lives in
 * the browser, so drive the MediaQueryList directly instead of relying on the
 * test DOM's media-query implementation.
 */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>();
  let matches = initialMatches;

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: MOBILE_MEDIA_QUERY,
    onchange: null,
    addEventListener: (_: string, cb: ChangeListener) => listeners.add(cb),
    removeEventListener: (_: string, cb: ChangeListener) =>
      listeners.delete(cb),
    // Legacy API, still probed by some implementations.
    addListener: (cb: ChangeListener) => listeners.add(cb),
    removeListener: (cb: ChangeListener) => listeners.delete(cb),
    dispatchEvent: () => true,
  };

  const matchMedia = vi.fn(() => mediaQueryList);
  vi.stubGlobal('matchMedia', matchMedia);

  return {
    matchMedia,
    /** Simulate the viewport crossing the breakpoint. */
    async resizeTo(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
      await nextTick();
    },
  };
}

// `useIsMobile` is a shared composable, so it initialises once on first call.
// Set the stub up before that happens and reuse it across these tests.
let viewport: ReturnType<typeof stubMatchMedia>;

describe('useIsMobile', () => {
  beforeAll(() => {
    viewport = stubMatchMedia(true);
  });

  it('tracks the md breakpoint (768px)', () => {
    // Guards the sub-pixel bound: a plain 767px would leave a gap between the
    // JS flag and Tailwind's `max-md:` utilities.
    expect(MOBILE_MEDIA_QUERY).toBe('(max-width: 767.98px)');
  });

  it('reflects the viewport at the time of the first call', () => {
    expect(useIsMobile().value).toBe(true);
    expect(viewport.matchMedia).toHaveBeenCalledWith(MOBILE_MEDIA_QUERY);
  });

  it('is reactive to viewport changes in both directions', async () => {
    const isMobile = useIsMobile();
    expect(isMobile.value).toBe(true);

    await viewport.resizeTo(false);
    expect(isMobile.value).toBe(false);

    await viewport.resizeTo(true);
    expect(isMobile.value).toBe(true);
  });

  it('gives every caller the same source of truth', async () => {
    // Two components must never disagree about the layout mid-resize, so all
    // callers share one MediaQueryList rather than each registering their own.
    const a = useIsMobile();
    const b = useIsMobile();
    expect(a).toBe(b);
    expect(viewport.matchMedia).toHaveBeenCalledTimes(1);

    await viewport.resizeTo(false);
    expect(a.value).toBe(false);
    expect(b.value).toBe(false);
  });
});
