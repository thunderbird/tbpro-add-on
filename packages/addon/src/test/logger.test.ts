import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The logger captures console.log/warn/error at module load time as `originalLog` etc.
// To make those references point at our spies we must:
//   1. set up the spies BEFORE the module loads
//   2. force a fresh module load each time with vi.resetModules()
// After the module loads, console.log is replaced by the logger wrapper, so we must
// hold spy references (logSpy/warnSpy/errorSpy) rather than re-reading console.log.

describe('logger (console wrapper)', () => {
  const VERSION = '0.8.0'; // matches __APP_VERSION__ in test setup.ts

  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Fresh module load — logger now captures logSpy/warnSpy/errorSpy as its originalLog etc.
    await import('../lib/logger');
  });

  afterEach(() => {
    delete (import.meta.env as Record<string, unknown>).VITE_LOGGER_LEVEL;
    vi.restoreAllMocks();
  });

  describe('debug', () => {
    it('is suppressed at the default warn level', () => {
      console.debug('msg');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('outputs with version prefix when level is debug', () => {
      (import.meta.env as Record<string, unknown>).VITE_LOGGER_LEVEL = 'debug';
      console.debug('msg');
      expect(logSpy).toHaveBeenCalledWith(`[${VERSION}]`, 'msg');
    });
  });

  describe('log / info', () => {
    it('is suppressed at the default warn level', () => {
      console.log('msg');
      console.info('msg');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('log outputs with version prefix when level is info', () => {
      (import.meta.env as Record<string, unknown>).VITE_LOGGER_LEVEL = 'info';
      console.log('msg');
      expect(logSpy).toHaveBeenCalledWith(`[${VERSION}]`, 'msg');
    });

    it('info outputs with version prefix when level is info', () => {
      (import.meta.env as Record<string, unknown>).VITE_LOGGER_LEVEL = 'info';
      console.info('msg');
      expect(logSpy).toHaveBeenCalledWith(`[${VERSION}]`, 'msg');
    });
  });

  describe('warn', () => {
    it('always outputs with version prefix', () => {
      console.warn('warn msg');
      expect(warnSpy).toHaveBeenCalledWith(`[${VERSION}]`, 'warn msg');
    });

    it('is suppressed when level is error', () => {
      (import.meta.env as Record<string, unknown>).VITE_LOGGER_LEVEL = 'error';
      console.warn('warn msg');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('forwards multiple arguments', () => {
      const obj = { value: 42 };
      console.warn('a', obj, 123);
      expect(warnSpy).toHaveBeenCalledWith(`[${VERSION}]`, 'a', obj, 123);
    });
  });

  describe('error', () => {
    it('always outputs with version prefix', () => {
      console.error('error msg');
      expect(errorSpy).toHaveBeenCalledWith(`[${VERSION}]`, 'error msg');
    });

    it('forwards multiple arguments', () => {
      const err = new Error('boom');
      console.error('failed', err);
      expect(errorSpy).toHaveBeenCalledWith(`[${VERSION}]`, 'failed', err);
    });
  });

  describe('level hierarchy', () => {
    it('debug level enables all methods', () => {
      (import.meta.env as Record<string, unknown>).VITE_LOGGER_LEVEL = 'debug';
      console.debug('d');
      console.log('l');
      console.warn('w');
      console.error('e');
      expect(logSpy).toHaveBeenCalledTimes(2); // debug + log both route through originalLog
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('unknown level falls back to warn', () => {
      (import.meta.env as Record<string, unknown>).VITE_LOGGER_LEVEL =
        'verbose';
      console.log('l');
      console.warn('w');
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
