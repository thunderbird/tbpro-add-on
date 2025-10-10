import { describe, expect, it } from 'vitest';
import {
  buildCSP,
  getCspConfig,
  getCSPForEnvironment,
  getEnvironmentConfig,
} from './csp.config.js';

describe('CSP Configuration', () => {
  const testEnv = {
    VITE_SEND_SERVER_URL: 'https://api.example.com',
    VITE_POSTHOG_HOST: 'https://posthog.example.com',
    VITE_SENTRY_DSN: 'https://abc@sentry.io/123',
    VITE_OIDC_ROOT_URL: 'https://auth.example.com',
  };

  describe('Helper Functions via getCspConfig', () => {
    it('processes environment variables correctly', () => {
      const config = getCspConfig(testEnv);
      const connectSrc = config['connect-src'];

      // envOrEmpty and suffix functionality
      expect(connectSrc).toContain('https://api.example.com');
      expect(connectSrc).toContain('https://posthog.example.com/*');
      expect(connectSrc).toContain('https://auth.example.com');

      // toWebSocketUrl conversion
      expect(connectSrc).toContain('wss://api.example.com');

      // sentryDomain conditional
      expect(connectSrc).toContain('https://*.sentry.io');
    });

    it('handles empty/missing environment values', () => {
      const config = getCspConfig({ VITE_SEND_SERVER_URL: '' });
      const connectSrc = config['connect-src'];

      expect(connectSrc).not.toContain('');
      expect(connectSrc.filter((src) => src.startsWith('ws'))).toHaveLength(0);
      expect(connectSrc).not.toContain('https://*.sentry.io');
    });
  });

  describe('getCspConfig', () => {
    it('returns complete default configuration', () => {
      const config = getCspConfig();

      expect(config['default-src']).toEqual(["'self'"]);
      expect(config['object-src']).toEqual(["'none'"]);
      expect(config['frame-ancestors']).toEqual(["'none'"]);
      expect(config['worker-src']).toEqual(["'self'", 'blob:']);

      // Check key directives contain expected values
      expect(config['script-src']).toEqual(
        expect.arrayContaining([
          "'self'",
          'blob:',
          'https://us-assets.i.posthog.com',
        ])
      );
      expect(config['style-src']).toEqual(
        expect.arrayContaining([
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ])
      );
      expect(config['connect-src']).toEqual(
        expect.arrayContaining(["'self'", 'https://*.backblazeb2.com'])
      );

      // Ensure no falsy values
      config['connect-src'].forEach((src) => expect(src).toBeTruthy());
    });

    it('includes environment-specific sources', () => {
      const config = getCspConfig(testEnv);
      expect(config['connect-src']).toEqual(
        expect.arrayContaining([
          'https://api.example.com',
          'wss://api.example.com',
          'https://posthog.example.com/*',
          'https://*.sentry.io',
          'https://auth.example.com',
        ])
      );
    });
  });

  describe('buildCSP', () => {
    it('converts config to CSP header string', () => {
      const config = {
        'default-src': ["'self'"],
        'script-src': ["'self'", 'blob:'],
      };
      const csp = buildCSP(config);

      expect(csp).toBe("default-src 'self'; script-src 'self' blob:");
      expect(buildCSP({})).toBe('');
      expect(buildCSP({ 'object-src': ["'none'"] })).toBe("object-src 'none'");
    });
  });

  describe('getEnvironmentConfig', () => {
    it('returns base config for unknown mode', () => {
      expect(getEnvironmentConfig('unknown', testEnv)).toEqual(
        getCspConfig(testEnv)
      );
    });

    it('adds localhost sources for development', () => {
      const config = getEnvironmentConfig('development', testEnv);

      expect(config['connect-src']).toEqual(
        expect.arrayContaining([
          'http://localhost:*',
          'ws://localhost:*',
          'https://api.example.com',
          'wss://api.example.com',
        ])
      );
    });

    it('filters localhost sources in production', () => {
      const config = getEnvironmentConfig('production', testEnv);
      const localhostSources = config['connect-src'].filter(
        (src) => src.includes('localhost:') || src.includes('backend:8080')
      );

      expect(localhostSources).toHaveLength(0);
      expect(config['connect-src']).toContain('wss://api.example.com');
      expect(config['connect-src']).toContain('https://api.example.com');
    });
  });

  describe('getCSPForEnvironment', () => {
    it('returns valid CSP strings', () => {
      const devCSP = getCSPForEnvironment('development', testEnv);
      const prodCSP = getCSPForEnvironment('production', testEnv);

      expect(typeof devCSP).toBe('string');
      expect(typeof prodCSP).toBe('string');
      expect(devCSP).toContain('localhost:*');

      // Production should not contain localhost in connect-src specifically
      const prodConfig = getEnvironmentConfig('production', testEnv);
      expect(prodConfig['connect-src']).not.toEqual(
        expect.arrayContaining(['http://localhost:*', 'http://backend:8080'])
      );

      expect(getCSPForEnvironment(undefined, testEnv)).toBe(devCSP);
      expect(getCSPForEnvironment('production', {})).toBeTruthy();
    });
  });

  describe('Security & External Services', () => {
    it('implements security best practices', () => {
      const config = getCspConfig();

      expect(config['object-src']).toEqual(["'none'"]);
      expect(config['frame-ancestors']).toEqual(["'none'"]);
      expect(config['default-src']).toContain("'self'");
      expect(config['worker-src']).toContain('blob:');
      expect(config['script-src']).toContain('blob:');
      expect(config['font-src']).toContain('data:');
      expect(config['img-src']).toContain('data:');
    });

    it('supports external services', () => {
      const config = getCspConfig();

      // Google Fonts
      expect(config['style-src']).toContain('https://fonts.googleapis.com');
      expect(config['font-src']).toContain('https://fonts.gstatic.com');

      // PostHog Analytics
      expect(config['script-src']).toContain('https://us-assets.i.posthog.com');
      expect(config['connect-src']).toEqual(
        expect.arrayContaining([
          'https://us-assets.i.posthog.com',
          'https://*.posthog.com/*',
          'https://us.i.posthog.com',
        ])
      );

      // Backblaze B2
      expect(config['connect-src']).toContain('https://*.backblazeb2.com');
    });

    it('conditionally includes Sentry', () => {
      const withSentry = getCspConfig({
        VITE_SENTRY_DSN: 'https://abc@sentry.io/123',
      });
      const withoutSentry = getCspConfig({});

      expect(withSentry['connect-src']).toContain('https://*.sentry.io');
      expect(withoutSentry['connect-src']).not.toContain('https://*.sentry.io');
    });
  });
});
