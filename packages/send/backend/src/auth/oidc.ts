import { JWT_EXPIRY_IN_MILLISECONDS } from '@send-backend/config';
import axios from 'axios';
import 'dotenv/config';

export interface TokenIntrospectionResponse {
  active: boolean;
  username?: string;
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

    // Cache the result for the same duration as the jwt or until token expires (whichever is shorter)

    const tokenExpiry = introspectionResult.exp
      ? introspectionResult.exp * 1000
      : Date.now() + JWT_EXPIRY_IN_MILLISECONDS;
    const cacheExpiry = Math.min(
      Date.now() + JWT_EXPIRY_IN_MILLISECONDS,
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
  };
}> {
  try {
    const introspectionResult = await introspectToken(token);

    if (!introspectionResult.active) {
      return { isValid: false };
    }

    // Check if token is expired
    if (
      introspectionResult.exp &&
      introspectionResult.exp < Date.now() / JWT_EXPIRY_IN_MILLISECONDS
    ) {
      return { isValid: false };
    }

    return {
      isValid: true,
      userInfo: {
        sub: introspectionResult.sub || introspectionResult.username || '',
        email: introspectionResult.email,
        username: introspectionResult.username,
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
