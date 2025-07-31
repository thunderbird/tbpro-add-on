import type { NextFunction, Request, Response } from 'express';
import { extractBearerToken, validateOIDCToken } from './oidc';

export interface OIDCUserInfo {
  sub: string;
  email?: string;
  username?: string;
}

export interface RequestWithOIDC extends Request {
  oidcUser?: OIDCUserInfo;
}

/**
 * Express middleware that validates OIDC tokens and adds user info to the request
 * This replaces the JWT-based authentication with OIDC token introspection
 */
export async function requireOIDCAuth(
  req: RequestWithOIDC,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    res.status(401).json({
      message: 'Authorization token required',
      error: 'missing_token',
    });
    return;
  }

  try {
    const validation = await validateOIDCToken(token);

    if (!validation.isValid) {
      res.status(401).json({
        message: 'Invalid or expired token',
        error: 'invalid_token',
      });
      return;
    }

    // Add user info to request for downstream handlers
    req.oidcUser = validation.userInfo;
    next();
  } catch (error) {
    console.error('OIDC authentication error:', error);
    res.status(500).json({
      message: 'Authentication service error',
      error: 'auth_service_error',
    });
  }
}
