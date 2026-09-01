import { PrismaClient } from '@prisma/client';

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getDataFromAuthenticatedRequest } from './auth/client';
import { validateJWT } from './auth/jwt';
import {
  extractBearerToken,
  isAccessTokenRevoked,
  validateOIDCToken,
} from './auth/oidc';
import { VERSION, X_LOGOUT_HEADER } from './config';
import { wrapAsyncHandler } from './errors/routes';
import { getUsedStorage } from './models';
import { fromPrismaV2 } from './models/prisma-helper';
import { getAdminStatus, getUserByOIDCSubject } from './models/users';
import {
  allPermissions,
  hasAdmin,
  hasRead,
  hasShare,
  hasWrite,
} from './types/custom';
import { getCookie } from './utils';
import { getStorageLimitForTier } from './utils/storageLimits';

// Extended request interface to include authentication info
interface AuthenticatedRequest extends Request {
  oidcUser?: {
    sub: string;
    email?: string;
    username?: string;
  };
  authenticatedUser?: {
    id: string;
    email: string;
    uniqueHash: string;
    tier: string;
  };
}

const prisma = new PrismaClient();
const PERMISSION_REQUEST_KEY = '_permission';

function extractMethodAndRoute(req) {
  return `${req.method} ${req.originalUrl}`;
}

function extractParamOrBody(req, prop: string) {
  return req.params[prop] ?? req.body[prop];
}

function extractContainerId(req): string {
  const prop = `containerId`;
  const val = extractParamOrBody(req, prop);
  try {
    return val;
  } catch (e) {
    console.error(
      `Could not find ${prop} for ${extractMethodAndRoute(req)}`,
      e
    );
    return null;
  }
}

export function reject(
  res: Response,
  status = 403,
  message = `Not authorized`
) {
  // Deny helpers get called on paths where something upstream may already have
  // answered -- `getGroupMemberPermissions` runs `requireAuth` with a sentinel
  // `next`, and `requireAuth` signals denial by responding rather than by
  // throwing. Writing a second time makes `res.send` call `setHeader` on a sent
  // response, which throws ERR_HTTP_HEADERS_SENT; inside an `async` middleware
  // Express 4 drops that rejection and Node terminates the process.
  //
  // The first response is also the better one: it distinguishes an expired
  // token (401, which the client auto-retries) from a missing one (403), where
  // this helper only ever says 403.
  if (res.headersSent) {
    console.warn(
      'reject() called after a response was already sent; keeping the first'
    );
    return;
  }

  res.status(status).json({
    message,
  });
  return;
}

/**
 * Per-request session liveness gate (#960).
 *
 * If the request carries an OIDC access token that Keycloak reports inactive
 * (the user logged out, changed their password, or was force-logged-out by an
 * admin), set the `x-logout` header, respond 401, and return `true` so the
 * caller stops — a revoked session must not fall back to a still-unexpired JWT
 * cookie. Returns `false` (caller continues) when there is no bearer token, the
 * token is merely expired (handled by the normal refresh flow), or introspection
 * is inconclusive (Keycloak down) — so we never force logout on routine expiry
 * or an outage.
 */
export async function rejectIfSessionRevoked(
  req: Request,
  res: Response
): Promise<boolean> {
  const token = extractBearerToken(req.headers?.authorization);
  if (!token) {
    return false;
  }
  if (await isAccessTokenRevoked(token)) {
    res.setHeader(X_LOGOUT_HEADER, '1');
    res
      .status(401)
      .json({ message: 'Not authorized: session is no longer active' });
    return true;
  }
  return false;
}

/**
 * Unified authentication middleware that supports both OIDC and legacy JWT authentication
 * This middleware prioritizes OIDC authentication but falls back to JWT for backward compatibility
 * Returns 403 if no valid authentication is found, 401 if token needs refresh
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // A revoked OIDC session must lose access immediately — do not fall back to a
  // still-unexpired JWT cookie.
  if (await rejectIfSessionRevoked(req, res)) {
    return;
  }

  // First, try OIDC authentication
  const authHeader = req.headers.authorization;
  const oidcToken = extractBearerToken(authHeader);

  if (oidcToken) {
    try {
      const validation = await validateOIDCToken(oidcToken);

      if (validation.isValid) {
        // Add OIDC user info to request
        req.oidcUser = validation.userInfo;

        // For compatibility, try to find the user in our database and add to request
        try {
          const user = await getUserByOIDCSubject(validation.userInfo.sub);
          if (user) {
            req.authenticatedUser = {
              id: user.id,
              email: user.email,
              uniqueHash: user.uniqueHash,
              tier: user.tier,
            };
          }
        } catch (error) {
          console.warn('Could not find OIDC user in database:', error);
        }

        return next();
      }
    } catch (error) {
      console.error('OIDC authentication failed:', error);
      // Don't return here, fall through to JWT authentication
    }
  }

  // Fallback to legacy JWT authentication
  const jwtToken = getCookie(req?.headers?.cookie, 'authorization');
  const jwtRefreshToken = getCookie(req?.headers?.cookie, 'refresh_token');

  const validationResult = validateJWT({ jwtToken, jwtRefreshToken });

  if (!validationResult) {
    return res
      .status(403)
      .json({ message: `Not authorized: No valid authentication found` });
  }

  if (validationResult === 'valid') {
    // Add JWT user info to request for backward compatibility
    try {
      const userData = getDataFromAuthenticatedRequest(req);
      req.authenticatedUser = userData;
    } catch (error) {
      console.error('Error extracting JWT user data:', error);
    }
    return next();
  }

  // When refresh token is invalid, we should return 403 and ask to login
  if (validationResult === 'shouldLogin') {
    return res.status(403).json({
      message: `Not authorized: Refresh token expired`,
    });
  }

  // When the refresh token is valid but the token is not, we should return 401
  // this is handled as autoretry in the client
  if (validationResult === 'shouldRefresh') {
    return res.status(401).json({
      message: `Not authorized: Token expired`,
    });
  }
}

/**
 * Legacy JWT-only middleware for backward compatibility
 * This middleware verifies the JWT token in the request cookies.
 * Returns 403 if token is missing, 401 if token needs refresh, or calls next() if valid.
 * Note: This middleware mirrors `isAuthed` from backend/src/trpc/middlewares.ts
 * These middlewares should be maintained in tandem to avoid unintended behavior
 */
export async function requireJWT(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // If the OIDC session behind this request has been revoked, deny and tell the
  // client to log out — regardless of the (still-unexpired) JWT cookie (#960).
  if (await rejectIfSessionRevoked(req, res)) {
    return;
  }

  const jwtToken = getCookie(req?.headers?.cookie, 'authorization');
  const jwtRefreshToken = getCookie(req?.headers?.cookie, 'refresh_token');

  const validationResult = validateJWT({ jwtToken, jwtRefreshToken });

  if (!validationResult) {
    // No cookie reached us at all. `error` is the machine-readable half, and
    // exists for the add-on: this is the only answer here that means "the
    // cookie is missing" rather than "the cookie is stale", and telling those
    // apart is what lets the add-on say Thunderbird is blocking cookies.
    // See send/frontend/src/lib/cookieAccess.ts (Bugzilla 2064458).
    return res.status(403).json({
      message: `Not authorized: Token not found`,
      error: 'token_not_found',
    });
  }

  if (validationResult === 'valid') {
    return next();
  }

  // When refresh token is invalid, we should return 403 and ask to login
  if (validationResult === 'shouldLogin') {
    // The refresh cookie did arrive; it just failed to verify. Cookies work,
    // they are only too old -- hence a different code to the case above.
    return res.status(403).json({
      message: `Not authorized: Refresh token expired`,
      error: 'refresh_token_expired',
    });
  }

  // When the refresh token is valid but the token is not, we should return 401
  // this is handled as autoretry in the client
  if (validationResult === 'shouldRefresh') {
    return res.status(401).json({
      message: `Not authorized: Token expired`,
      error: 'access_token_expired',
    });
  }
}

// Returns a middleware function that renames a property in req.body
export function renameBodyProperty(from: string, to: string) {
  return (req, res, next) => {
    if (req.body[from] !== undefined) {
      req.body[to] = req.body[from];
      delete req.body[from];
    }
    next();
  };
}

/**
 * Helper function to get user data from either OIDC or JWT authentication
 */
function getAuthenticatedUserData(
  req: AuthenticatedRequest
): { id: string; email: string } | null {
  // Prefer the unified authenticatedUser field
  if (req.authenticatedUser) {
    return {
      id: req.authenticatedUser.id,
      email: req.authenticatedUser.email,
    };
  }

  // Fallback to legacy JWT extraction
  try {
    const userData = getDataFromAuthenticatedRequest(req);
    return {
      id: userData.id,
      email: userData.email,
    };
  } catch (error) {
    console.warn('Could not extract user data from request:', error);
    return null;
  }
}

// Gets a user's permissions for a container and adds it to the request.
export const getGroupMemberPermissions: RequestHandler = wrapAsyncHandler(
  async (req, res, next) => {
    // Since we're calling a function intended to be used as middleware, we need to call next() if auth is valid
    // We set a boolean to make sure next() is called. This means that the auth has been verified
    let goodToGo = false;
    // Express calls `next(err)` to report failure, so a sentinel that ignores
    // its argument would read an auth error as success. `requireAuth` does not
    // do that today; this makes sure it cannot start to.
    const nextTrigger = (err?: unknown) => {
      goodToGo = !err;
    };
    await requireAuth(req as AuthenticatedRequest, res, nextTrigger);

    if (!goodToGo) {
      // `requireAuth` has already answered on every denial path. `reject` is a
      // no-op once that has happened, and is here for the case where it has not.
      return reject(res);
    }

    const userData = getAuthenticatedUserData(req as AuthenticatedRequest);
    if (!userData) {
      console.error('No authenticated user data found');
      return reject(res);
    }

    const userId = userData.id;
    const containerId = extractContainerId(req);

    /* 
    Users have full permissions to their own top-level (aka root folder)
    Whenever a request doesn't contain a containerId, we assume it's a top-level folder
    This happens client side when creating a new folder that doesn't have a parent
    It also happens when a new account is created and we create a default folder
   */
    if (userId && !containerId) {
      req[PERMISSION_REQUEST_KEY] = allPermissions();
      next();
      return;
    }

    if (!userId || !containerId) {
      reject(res);
      return;
    }

    try {
      const findGroupQuery = {
        where: {
          container: {
            id: containerId,
          },
        },
      };
      const group = await fromPrismaV2(
        prisma.group.findFirstOrThrow,
        findGroupQuery
      );

      const findMembershipQuery = {
        where: {
          groupId_userId: { groupId: group.id, userId },
        },
      };
      const membership = await fromPrismaV2(
        prisma.membership.findUniqueOrThrow,
        findMembershipQuery
      );

      // Attach it to the request
      req[PERMISSION_REQUEST_KEY] = membership.permission;
      next();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      reject(res);
      return;
    }
  }
);

export function requireReadPermission(req, res, next) {
  if (!hasRead(req[PERMISSION_REQUEST_KEY])) {
    console.warn(`Missing read permission`);
    reject(res);
    return;
  }
  next();
}
export function requireWritePermission(req, res, next) {
  if (!hasWrite(req[PERMISSION_REQUEST_KEY])) {
    console.warn(`Missing write permission`);
    reject(res);
    return;
  }
  next();
}
export function requireAdminPermission(req, res, next) {
  if (!hasAdmin(req[PERMISSION_REQUEST_KEY])) {
    console.warn(`Missing admin permission`);
    reject(res);
    return;
  }
  next();
}
export function requireSharePermission(req, res, next) {
  if (!hasShare(req[PERMISSION_REQUEST_KEY])) {
    console.warn(`Missing share permission`);
    reject(res);
    return;
  }
  next();
}

export function requirePublicLogin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (process.env?.ALLOW_PUBLIC_LOGIN === 'true') {
    return next();
  }
  return reject(res, 500, 'Public login is disabled');
}

// We add the package.json version to the response headers
export function addVersionHeader(
  _: Request,
  res: Response,
  next: NextFunction
) {
  res.setHeader('x-tbsend', VERSION);
  next();
}

/**
 * Read the caller's identity, or respond 403 and return null.
 *
 * `getDataFromAuthenticatedRequest` throws when there is no `authorization`
 * cookie. Inside an `async` middleware that throw becomes a rejected promise,
 * and Express 4 discards it -- `Layer.handle_request` only try/catches
 * synchronous throws -- so Node terminates the process. One anonymous request
 * would take out a replica.
 *
 * Every caller below is also gated by `requireJWT`, so this should be
 * unreachable. That is exactly why it is here: the gate is a matter of argument
 * order at each call site, and the cost of getting that order wrong should be a
 * 403, not an outage.
 */
function getCallerOrReject(req: Request, res: Response) {
  try {
    return getDataFromAuthenticatedRequest(req);
  } catch {
    reject(res);
    return null;
  }
}

// Wrapped rather than exported bare: `getUsedStorage` and `getAdminStatus` reach
// the database, and a rejection there is the same unhandled-rejection process
// kill as above. `wrapAsyncHandler` routes it to `next` instead.
export const checkStorageLimit: RequestHandler = wrapAsyncHandler(
  async function checkStorageLimit(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // Check if the body has the size property
    const size = req?.body?.size || 0;

    const caller = getCallerOrReject(req, res);
    if (!caller) return;

    const { tier, id } = caller;
    const limit = getStorageLimitForTier(tier);

    const { active } = await getUsedStorage(id);

    if (active + size >= limit) {
      return res.status(403).json({
        message: `Storage limit exceeded. Please remove files to continue uploading.`,
      });
    }

    return next();
  }
);

export const requireAdminPermisions: RequestHandler = wrapAsyncHandler(
  async function requireAdminPermisions(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const caller = getCallerOrReject(req, res);
    if (!caller) return;

    const adminStatus = await getAdminStatus(caller.id);
    if (!adminStatus) {
      return reject(res);
    }
    next();
  }
);
