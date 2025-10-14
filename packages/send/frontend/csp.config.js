/**
 * Content Security Policy Configuration for Send Frontend
 *
 * This file centralizes CSP configuration to make it easier to maintain
 * and understand the security requirements of the Send application.
 */

/**
 * Helper function to get environment variable as array or return empty array
 * @param {string} value - Environment variable value
 * @param {string} [suffix] - Optional suffix to append to the value
 * @returns {string[]} - Array containing the value or empty array
 */
function envOrEmpty(value, suffix = '') {
  return value ? [value + suffix] : [];
}

/**
 * Helper function to convert HTTP/HTTPS URL to WebSocket URL for connections
 * @param {string} url - URL to convert
 * @returns {string[]} - Array containing WebSocket URL or empty array
 */
function toWebSocketUrl(url) {
  if (!url) return [];

  if (url.startsWith('https://')) {
    return [url.replace('https://', 'wss://')];
  }

  if (url.startsWith('http://')) {
    return [url.replace('http://', 'ws://')];
  }

  return [];
}

/**
 * Helper function to return Sentry domain if DSN is provided
 * @param {string} dsn - Sentry DSN
 * @returns {string[]} - Array containing Sentry domain or empty array
 */
function sentryDomain(dsn) {
  return dsn ? ['https://*.sentry.io'] : [];
}

/**
 * Content Security Policy directives configuration
 * Each directive controls which resources can be loaded from specific sources
 * @param {Object} env - Environment variables object
 */
export function getCspConfig(env = {}) {
  return {
    // Default policy for all resource types not explicitly covered by other directives
    'default-src': [
      "'self'", // Only allow resources from the same origin
    ],

    // Controls which scripts can be executed
    'script-src': [
      "'self'", // Same-origin scripts
      'blob:', // Blob URLs (needed for Web Workers and dynamic scripts)
      'https://us-assets.i.posthog.com', // PostHog analytics scripts
    ],

    // Controls Web Workers, Service Workers, and shared workers
    'worker-src': [
      "'self'", // Same-origin workers
      'blob:', // Blob URLs for dynamically created workers
    ],

    // Controls stylesheets and CSS resources
    'style-src': [
      "'self'", // Same-origin styles
      "'unsafe-inline'", // Inline styles (needed for dynamic styling)
      'https://fonts.googleapis.com', // Google Fonts CSS
    ],

    // Controls image sources
    'img-src': [
      "'self'", // Same-origin images
      'https:', // Any HTTPS image source
      'data:', // Data URLs for inline images
    ].filter((n) => n),

    // Controls font sources
    'font-src': [
      "'self'", // Same-origin fonts
      'data:', // Data URLs for inline fonts
      'https://fonts.gstatic.com', // Google Fonts resources
    ],

    // Controls plugin content (Flash, Java, etc.)
    'object-src': [
      "'none'", // Block all plugin content for security
    ],

    // Controls which pages can embed this page in frames/iframes
    'frame-ancestors': [
      "'none'", // Prevent clickjacking by disallowing any framing
    ],

    // Controls network connections (XHR, WebSocket, EventSource, etc.)
    'connect-src': [
      "'self'", // Same-origin requests

      // Backend services
      ...envOrEmpty(env.VITE_SEND_SERVER_URL),
      ...toWebSocketUrl(env.VITE_SEND_SERVER_URL),
      // External services
      ...envOrEmpty(env.VITE_POSTHOG_HOST, '/*'),
      'https://us-assets.i.posthog.com', // PostHog analytics (fallback)
      'https://*.backblazeb2.com', // Backblaze B2 storage
      ...sentryDomain(env.VITE_SENTRY_DSN), // Sentry error reporting
      'https://*.posthog.com/*', // PostHog analytics (fallback)
      'https://us.i.posthog.com', // PostHog ingestion (fallback)
      ...envOrEmpty(env.VITE_OIDC_ROOT_URL),
    ].filter(Boolean), // Remove any undefined/null entries
  };
}

/**
 * Builds a Content-Security-Policy string from the configuration object
 * @param {Object} config - CSP configuration object
 * @returns {string} - CSP header value
 */
export function buildCSP(config) {
  return Object.entries(config)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * Gets environment-specific CSP configurations
 * @param {string} mode - The build mode ('development' or 'production')
 * @param {Object} env - Environment variables object
 * @returns {Object} - CSP configuration object for the environment
 */
export function getEnvironmentConfig(mode = 'development', env = {}) {
  const baseConfig = getCspConfig(env);

  if (mode === 'development') {
    return {
      ...baseConfig,
      // Development might need additional localhost sources
      'connect-src': [
        ...baseConfig['connect-src'],
        'http://backend:8080', // Docker backend service (fallback)
        'http://localhost:*', // Allow any localhost port in development
        'https://localhost:*', // Allow any localhost port in development
        'ws://localhost:*', // Allow WebSocket connections to any localhost port
        'wss://localhost:*', // Allow WebSocket connections to any localhost port
      ],
    };
  }

  if (mode === 'production') {
    return {
      ...baseConfig,
      // Production should filter out development-specific localhost sources
      // but keep WebSocket URLs for production server
      'connect-src': baseConfig['connect-src'].filter((src) => {
        // Keep WebSocket URLs (wss:// and ws://) for production
        if (src.startsWith('wss://') || src.startsWith('ws://')) {
          return true;
        }
        // Filter out localhost and docker backend sources
        return !src.includes('localhost:') && !src.includes('backend:8080');
      }),
    };
  }

  return baseConfig;
}

/**
 * Gets the appropriate CSP configuration for the current environment
 * @param {string} mode - The build mode ('development' or 'production')
 * @param {Object} env - Environment variables object
 * @returns {string} - CSP header value for the environment
 */
export function getCSPForEnvironment(mode = 'development', env = {}) {
  const config = getEnvironmentConfig(mode, env);
  return buildCSP(config);
}

export function getHeadersForEnvironment(mode = 'development', env = {}) {
  return {
    // Security headers
    'Content-Security-Policy': getCSPForEnvironment(mode, env),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}
