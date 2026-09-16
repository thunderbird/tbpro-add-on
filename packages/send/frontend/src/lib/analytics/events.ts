/**
 * Central analytics event catalog (frontend).
 *
 * Naming convention: `object_action` in snake_case, e.g. `file_downloaded`,
 * `access_link_created`. Property keys must also be snake_case
 * (e.g. `upload_id`, not `uploadId`). Add new events here — never hardcode
 * event-name strings at call sites.
 */
export const ANALYTICS_EVENTS = {
  FILE_DOWNLOADED: 'file_downloaded',
  KEYS_RESTORE_ATTEMPTED: 'keys_restore_attempted',
  KEYS_RESTORE_FAILED: 'keys_restore_failed',
  TOKEN_INVALID: 'token_invalid',
  CONTENT_REPORT_STARTED: 'content_report_started',
  CONTENT_REPORT_COMPLETED: 'content_report_completed',
  CONTENT_REPORT_FLAGGED: 'content_report_flagged',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
