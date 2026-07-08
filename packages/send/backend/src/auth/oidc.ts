import axios from 'axios';
import 'dotenv/config';

export interface TokenIntrospectionResponse {
  active: boolean;
  username?: string;
  name?: string;
  email?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  client_id?: string;
  scope?: string;
  [key: string]: unknown;
}

interface TokenCacheEntry {
  response: TokenIntrospectionResponse;
  expires: number;
}

// Simple in-memory cache for token introspection results
const tokenCache = new Map<string, TokenCacheEntry>();

// How long an introspection result is trusted before we ask Keycloak again.
// Short enough that a revoked session loses access promptly (#960), long
// enough that a burst of requests (e.g. a multipart upload) isn't one
// introspection call per request.
export const INTROSPECTION_CACHE_MS = 60 * 1000;

/**
 * Introspects an OIDC token with the configured authorization server
 * @param token The access token to introspect
 * @returns Promise<TokenIntrospectionResponse>
 */
export async function introspectToken(
  token: string
): Promise<TokenIntrospectionResponse> {
  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.expires > Date.now()) {
    return cached.response;
  }

  const introspectionUrl = process.env.OIDC_TOKEN_INTROSPECTION_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;

  if (!introspectionUrl || !clientId || !clientSecret) {
    throw new Error(
      'OIDC configuration missing. Please set OIDC_TOKEN_INTROSPECTION_URL, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET'
    );
  }

  try {
    const response = await axios.post(
      introspectionUrl,
      new URLSearchParams({
        token,
        token_type_hint: 'access_token',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: {
          username: clientId,
          password: clientSecret,
        },
        timeout: 5000,
      }
    );

    const introspectionResult: TokenIntrospectionResponse = response.data;

    // Cache the result briefly so per-request introspection doesn't hammer
    // Keycloak (e.g. during multipart uploads), while still catching a revoked
    // session — logout / password change / admin force-logout — within
    // INTROSPECTION_CACHE_MS. Never cache past the token's own expiry.
    const tokenExpiry = introspectionResult.exp
      ? introspectionResult.exp * 1000
      : Date.now() + INTROSPECTION_CACHE_MS;
    const cacheExpiry = Math.min(
      Date.now() + INTROSPECTION_CACHE_MS,
      tokenExpiry
    );

    tokenCache.set(token, {
      response: introspectionResult,
      expires: cacheExpiry,
    });

    // Clean up expired cache entries periodically
    if (Math.random() < 0.1) {
      // 10% chance to cleanup on each introspection
      const now = Date.now();
      for (const [cachedToken, entry] of tokenCache.entries()) {
        if (entry.expires <= now) {
          tokenCache.delete(cachedToken);
        }
      }
    }

    return introspectionResult;
  } catch (error) {
    console.error('Token introspection failed:', error);
    throw new Error('Token introspection failed');
  }
}

/**
 * Per-request liveness check for an access token (#960).
 * @returns `true` if Keycloak reports the token active, `false` if it reports
 * it inactive (session revoked/expired), and `null` if introspection could not
 * be performed (misconfig or Keycloak unreachable). Callers should treat `null`
 * as inconclusive and fail OPEN — a Keycloak blip must not sign everyone out.
 */
export async function isTokenActive(token: string): Promise<boolean | null> {
  try {
    const result = await introspectToken(token);
    return result.active === true;
  } catch (error) {
    console.error('Token introspection unavailable (failing open):', error);
    return null;
  }
}

/**
 * Validates an OIDC token and returns user information if valid
 * @param token The access token to validate
 * @returns Promise<{isValid: boolean, userInfo?: any}>
 */
export async function validateOIDCToken(token: string): Promise<{
  isValid: boolean;
  userInfo?: {
    sub: string;
    email?: string;
    username?: string;
    thundermailEmail?: string;
    name?: string;
  };
}> {
  try {
    const introspectionResult = await introspectToken(token);

    // `active` already reflects expiry and revocation, so it is the single
    // source of truth — an expired or revoked token comes back active:false.
    if (!introspectionResult.active) {
      return { isValid: false };
    }

    return {
      isValid: true,
      userInfo: {
        sub: introspectionResult.sub || introspectionResult.username || '',
        email: introspectionResult.email,
        username: introspectionResult.username,
        name: introspectionResult.name,
      },
    };
  } catch (error) {
    console.error('OIDC token validation failed:', error);
    return { isValid: false };
  }
}

/**
 * Extract Bearer token from Authorization header
 * @param authHeader The Authorization header value
 * @returns The token or null if not found
 */
export function extractBearerToken(
  authHeader: string | undefined
): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7); // Remove 'Bearer ' prefix
}
