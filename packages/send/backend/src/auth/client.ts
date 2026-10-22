import {
  DAYS_TO_EXPIRY,
  JWT_EXPIRY_IN_MILLISECONDS,
  JWT_EXPIRY_IN_SECONDS,
  JWT_REFRESH_TOKEN_EXPIRY_IN_DAYS,
  JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS,
} from '@send-backend/config';
import { AuthResponse } from '@send-backend/routes/auth';
import { convertDaysToMilliseconds, getCookie } from '@send-backend/utils';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const refreshTokenExpiration = convertDaysToMilliseconds(
  JWT_REFRESH_TOKEN_EXPIRY_IN_DAYS
);

export function getAllowedOrigins() {
  const envOrigins = process.env.SEND_BACKEND_CORS_ORIGINS;
  if (!envOrigins) {
    throw new Error(
      'Environment variable SEND_BACKEND_CORS_ORIGINS must be set'
    );
  }

  // Force this to be an array of strings of non-zero length
  return envOrigins
    .split(',')
    .map((n) => n.trim())
    .filter(String);
}

export type CookieTokenKind = 'access' | 'refresh';

const COOKIE_TOKENS: Record<
  CookieTokenKind,
  { secret: () => string; lifetimeSeconds: number }
> = {
  access: {
    secret: () => process.env.ACCESS_TOKEN_SECRET!,
    lifetimeSeconds: JWT_EXPIRY_IN_SECONDS,
  },
  refresh: {
    secret: () => process.env.REFRESH_TOKEN_SECRET!,
    lifetimeSeconds: JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS,
  },
};

// Only the session fields go into the token. Callers pass DB rows or the
// payload of a verified token, which would otherwise carry extra columns and
// the previous `exp`/`iat` claims into the new signature.
function toTokenPayload({
  id,
  uniqueHash,
  email,
  tier,
}: AuthResponse): AuthResponse {
  return { id, uniqueHash, email, tier };
}

// `expiresIn` lets jsonwebtoken set `exp` in seconds, the unit verify() reads.
function signCookieToken(data: AuthResponse, kind: CookieTokenKind): string {
  const { secret, lifetimeSeconds } = COOKIE_TOKENS[kind];
  return jwt.sign(toTokenPayload(data), secret(), {
    expiresIn: lifetimeSeconds,
  });
}

// Verifies the signature before trusting the payload, so a forged cookie can't
// name another user, and bounds the token's age by `iat` as well as `exp`, so
// a token whose `exp` claim is unusable still expires on schedule. Throws on
// an invalid, unsigned or expired token.
export function getUserFromJWT(
  token: string,
  kind: CookieTokenKind = 'access'
): AuthResponse {
  const { secret, lifetimeSeconds } = COOKIE_TOKENS[kind];
  return jwt.verify(token, secret(), {
    maxAge: lifetimeSeconds,
  }) as AuthResponse;
}

export function getJWTfromToken(jwtToken: string): string | null {
  const isValidTokenFormatting =
    typeof jwtToken === 'string' && jwtToken.startsWith('Bearer ');

  if (!isValidTokenFormatting) {
    return null;
  }

  const token = jwtToken.split('Bearer ')[1];
  return token;
}

export function getDataFromAuthenticatedRequest(req: Request) {
  const jwtToken = getCookie(req?.headers?.cookie, 'authorization');
  const token = getJWTfromToken(jwtToken);
  if (!token)
    throw new Error(
      'No token found in request: This should not happen if the user is authenticated'
    );
  const user = getUserFromJWT(token);
  return user;
}

export const clearJWTCookies = (res: Response) => {
  clearCookie('authorization', res);
  clearCookie('refresh_token', res);
};

export const registerAuthToken = (signedData: AuthResponse, res: Response) => {
  const jwtToken = signCookieToken(signedData, 'access');

  res.cookie('authorization', `Bearer ${jwtToken}`, {
    maxAge: JWT_EXPIRY_IN_MILLISECONDS,
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    // Set the expiration on date format
    expires: new Date(Date.now() + JWT_EXPIRY_IN_MILLISECONDS),
  });
};

export const clearCookie = (cookieName: string, res: Response) => {
  res.cookie(cookieName, `null`, {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'none',
    secure: true,
  });
};

export const getStorageLimit = (req: Request) => {
  const { tier } = getDataFromAuthenticatedRequest(req);
  const hasLimitedStorage = tier === 'EPHEMERAL';
  return { hasLimitedStorage, daysToExpiry: DAYS_TO_EXPIRY };
};

export function registerTokens(signedData: AuthResponse, res: Response) {
  const refreshTokenToken = signCookieToken(signedData, 'refresh');

  res.cookie('refresh_token', `Bearer ${refreshTokenToken}`, {
    maxAge: refreshTokenExpiration.milliseconds,
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    // Set the expiration on date format
    expires: new Date(Date.now() + refreshTokenExpiration.milliseconds),
  });

  registerAuthToken(signedData, res);
}

export async function verifyHash(input: string, hash: string) {
  return await bcrypt.compare(input, hash);
}

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  return hash;
}
