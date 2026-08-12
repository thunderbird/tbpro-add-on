import { createSharedComposable, useMediaQuery } from '@vueuse/core';

/**
 * "Mobile" is everything below Tailwind's `md` breakpoint (768px). A media
 * query `max-width` is inclusive and viewport widths can be fractional on
 * zoomed/HiDPI displays, so the bound is 767.98px rather than 767px — that way
 * the JS state and the `max-md:` utilities flip at exactly the same width
 * instead of disagreeing over the sub-pixel range in between.
 *
 * Exported so callers can reuse the query (e.g. in tests) rather than
 * re-typing the literal. The one hand-rolled `@media (max-width: 767.98px)`
 * block in FolderNavigation.vue mirrors this value; scoped CSS can't read a TS
 * constant, so keep the two in sync by hand.
 */
export const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)';

/**
 * Reactive flag that is `true` while the viewport is below Tailwind's `md`
 * breakpoint, for the places where a layout decision has to be made in JS
 * rather than in CSS (conditional rendering, inline styles).
 *
 * Wrapped in `createSharedComposable` so every component observes one shared
 * `MediaQueryList` instead of registering its own listener. Beyond saving
 * listeners this removes a class of bug: separate `useMediaQuery` calls are
 * updated independently, so two components could briefly disagree about
 * whether the app is "mobile" during a resize and render a mismatched layout.
 *
 * @example
 * const isMobile = useIsMobile();
 * // template: <td v-if="!isMobile">…</td>
 */
export const useIsMobile = createSharedComposable(() =>
  useMediaQuery(MOBILE_MEDIA_QUERY)
);
