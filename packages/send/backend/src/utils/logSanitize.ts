/**
 * Make a user-controlled value safe to interpolate into a single log line.
 *
 * Request paths, IPs and error messages that echo request data can carry CR/LF
 * and other control characters, which lets a client forge extra log lines or
 * corrupt log parsing (log injection, SonarCloud S5145). Every control
 * character (including CR, LF and TAB, and DEL) is replaced with a space and
 * the result is capped so a hostile URL cannot flood the log either.
 */
export const MAX_LOG_VALUE_LENGTH = 1024;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function sanitizeForLog(
  value: unknown,
  maxLength: number = MAX_LOG_VALUE_LENGTH
): string {
  const text = typeof value === 'string' ? value : String(value ?? '');
  const cleaned = text.replace(CONTROL_CHARS, ' ');
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength)}...[truncated]`
    : cleaned;
}
