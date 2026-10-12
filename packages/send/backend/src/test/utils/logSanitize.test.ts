import { describe, expect, it } from 'vitest';
import { MAX_LOG_VALUE_LENGTH, sanitizeForLog } from '../../utils/logSanitize';

describe('sanitizeForLog', () => {
  it('leaves ordinary text untouched', () => {
    expect(sanitizeForLog('/api/uploads/abc?x=1')).toBe('/api/uploads/abc?x=1');
  });

  it('neutralizes CR and LF so a value cannot forge a new log line', () => {
    const forged = '/ok\r\n500 - GET /admin - 10.0.0.1 - forged';
    const out = sanitizeForLog(forged);
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toBe('/ok  500 - GET /admin - 10.0.0.1 - forged');
  });

  it('replaces every other control character too (TAB, NUL, ESC, DEL)', () => {
    expect(sanitizeForLog('a\tb\u0000c\u001bd\u007fe')).toBe('a b c d e');
  });

  it('stringifies non-string input', () => {
    expect(sanitizeForLog(404)).toBe('404');
    expect(sanitizeForLog(true)).toBe('true');
    expect(sanitizeForLog(undefined)).toBe('');
    expect(sanitizeForLog(null)).toBe('');
  });

  it('serializes objects as JSON instead of "[object Object]"', () => {
    // JSON escapes the newline itself, so the log line stays intact.
    expect(sanitizeForLog({ a: 1, b: 'x\ny' })).toBe('{"a":1,"b":"x\\ny"}');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(sanitizeForLog(cyclic)).toBe('[unserializable object]');
  });

  it('caps the length to keep a hostile URL from flooding the log', () => {
    const long = 'x'.repeat(MAX_LOG_VALUE_LENGTH + 50);
    const out = sanitizeForLog(long);
    expect(out.startsWith('x'.repeat(MAX_LOG_VALUE_LENGTH))).toBe(true);
    expect(out.endsWith('...[truncated]')).toBe(true);
    expect(out).toHaveLength(MAX_LOG_VALUE_LENGTH + '...[truncated]'.length);
  });
});
