// utils/console-wrapper.js
const version = __APP_VERSION__;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export const loggerPrefix = {
  debug: 'LOGGER DEBUG',
  info: 'LOGGER INFO',
  warn: 'LOGGER WARNING',
  error: 'LOGGER ERROR',
};

const originalConsole = { ...console };
const originalLog = originalConsole.log;
const originalWarn = originalConsole.warn;
const originalError = originalConsole.error;

// Get the configured log level from import.meta.VITE_LOGGER_LEVEL
const getConfiguredLevel = (): number => {
  const level = import.meta.env.VITE_LOGGER_LEVEL as LogLevel | undefined;
  return level && level in LOG_LEVELS ? LOG_LEVELS[level] : LOG_LEVELS.warn;
};

const shouldLog = (messageLevel: LogLevel): boolean => {
  const configuredLevel = getConfiguredLevel();
  return LOG_LEVELS[messageLevel] >= configuredLevel;
};

// Wrap common console methods
console.debug = (...args) => {
  if (shouldLog('debug')) {
    originalLog(`[${version}]`, ...args);
  }
};

console.log = (...args) => {
  if (shouldLog('info')) {
    originalLog(`[${version}]`, ...args);
  }
};
console.info = (...args) => {
  if (shouldLog('info')) {
    originalLog(`[${version}]`, ...args);
  }
};

console.warn = (...args) => {
  if (shouldLog('warn')) {
    originalWarn(`[${version}]`, ...args);
  }
};
console.error = (...args) => {
  if (shouldLog('error')) {
    originalError(`[${version}]`, ...args);
  }
};
