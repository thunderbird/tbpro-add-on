/**
 * Central analytics event catalog (backend).
 *
 * Naming convention: `object_action` in snake_case, e.g. `upload_completed`,
 * `access_link_created`. Property keys must also be snake_case. Keep names
 * consistent with the frontend catalog in
 * packages/send/frontend/src/lib/analytics/events.ts.
 */
export const ANALYTICS_EVENTS = {
  ACCESS_LINK_CREATED: 'access_link_created',
  UPLOAD_COMPLETED: 'upload_completed',
  PAGE_LOADED: 'page_loaded',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
