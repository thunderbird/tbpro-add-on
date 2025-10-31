import { NextFunction, Request, Response } from 'express';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

interface PerformanceThresholds {
  /** Fast requests (green) - under this threshold */
  fast: number;
  /** Slow requests (yellow) - between fast and slow */
  slow: number;
  /** Very slow requests (red) - above slow threshold */
}

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  fast: 100, // < 100ms - green
  slow: 300, // 100-300ms - yellow, >300ms - red
};

/**
 * Performance logging middleware that colors output based on request duration
 */
export function performanceLogger(
  thresholds: Partial<PerformanceThresholds> = {}
) {
  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };

  return (req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();

    res.on('finish', () => {
      const duration = performance.now() - start;
      const durationStr = duration.toFixed(1);

      let color: string;
      let level: string;

      if (duration < config.fast) {
        color = colors.green;
        level = 'FAST';
      } else if (duration < config.slow) {
        color = colors.yellow;
        level = 'SLOW';
      } else {
        color = colors.red;
        level = 'VERY SLOW';
      }

      // Only log requests that are above the fast threshold to reduce noise
      if (duration >= config.fast) {
        console.log(
          `${color}[${level}]${colors.reset} ${colors.cyan}${req.method}${colors.reset} ${colors.gray}${req.originalUrl}${colors.reset} - ${color}${durationStr}ms${colors.reset}`
        );
      }
    });

    next();
  };
}

/**
 * Simple performance logger that only logs slow requests (backwards compatible)
 */
export function slowRequestLogger(threshold = 300) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();

    res.on('finish', () => {
      const duration = performance.now() - start;

      if (duration > threshold) {
        console.warn(
          `${colors.red}[SLOW]${colors.reset} ${req.method} ${req.originalUrl} - ${colors.red}${duration.toFixed(1)}ms${colors.reset}`
        );
      }
    });

    next();
  };
}
