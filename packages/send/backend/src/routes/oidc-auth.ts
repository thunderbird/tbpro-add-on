import {
  clearJWTCookies,
  registerAuthToken,
  registerTokens,
} from '@send-backend/auth/client';
import {
  findOrCreateUserByOIDC,
  getUserByOIDCSubject,
  updateUniqueHash,
} from '@send-backend/models/users';
import { createHash } from 'crypto';
import { Router } from 'express';
import { RequestWithOIDC, requireOIDCAuth } from '../auth/oidc-middleware';
import {
  addErrorHandling,
  AUTH_ERRORS,
  wrapAsyncHandler,
} from '../errors/routes';

const router: Router = Router();

/**
 * Endpoint for handling OIDC authentication after the frontend completes the OAuth flow
 * The frontend should call this endpoint with the access token received from OIDC
 */
router.get(
  '/oidc/authenticate',
  requireOIDCAuth,
  addErrorHandling(AUTH_ERRORS.AUTH_FAILED),
  wrapAsyncHandler(async (req: RequestWithOIDC, res) => {
    if (!req.oidcUser) {
      return res.status(401).json({
        message: 'OIDC authentication required',
        error: 'missing_oidc_user',
      });
    }

    const { sub, email, username } = req.oidcUser;

    try {
      // Find or create user based on OIDC subject
      const user = await findOrCreateUserByOIDC({
        oidcSubject: sub,
        email: email || '',
        thundermailEmail: username || '',
      });

      const uniqueHash = createHash('sha256').update(sub).digest('hex');
      user.uniqueHash = uniqueHash;
      await updateUniqueHash(user.id, uniqueHash);

      registerTokens(user, res);

      return res.status(200).json({
        message: 'Authentication successful',
        user: {
          id: user.id,
          email: user.email,
          uniqueHash: user.uniqueHash,
          tier: user.tier,
        },
      });
    } catch (error) {
      console.error('Error during OIDC authentication:', error);
      return res.status(500).json({
        message: 'Failed to authenticate user',
        error: 'user_creation_failed',
      });
    }
  })
);

/**
 * Endpoint to validate the current OIDC token and return user info
 * Equivalent to the old /auth/me endpoint but using OIDC
 */
router.get(
  '/oidc/me',
  requireOIDCAuth,
  addErrorHandling(AUTH_ERRORS.AUTH_FAILED),
  wrapAsyncHandler(async (req: RequestWithOIDC, res) => {
    if (!req.oidcUser) {
      return res.status(401).json({
        message: 'OIDC authentication required',
        error: 'missing_oidc_user',
      });
    }

    const { sub } = req.oidcUser;

    try {
      const user = await getUserByOIDCSubject(sub);

      if (!user) {
        return res.status(404).json({
          message: 'User not found',
          error: 'user_not_found',
        });
      }

      registerAuthToken(user, res);

      return res.status(200).json({
        message: 'User authenticated',
        user: {
          id: user.id,
          email: user.email,
          uniqueHash: user.uniqueHash,
          tier: user.tier,
        },
      });
    } catch (error) {
      console.error('Error getting user info:', error);
      return res.status(500).json({
        message: 'Failed to get user information',
        error: 'user_fetch_failed',
      });
    }
  })
);

/**
 * Endpoint for logging out (no server-side action needed with stateless OIDC)
 * The frontend should clear the token and redirect to OIDC logout URL if needed
 */
router.post(
  '/oidc/logout',
  addErrorHandling(AUTH_ERRORS.LOG_OUT_FAILED),
  wrapAsyncHandler(async (req, res) => {
    // With stateless OIDC, logout is handled client-side
    // The frontend should:
    // 1. Clear the access token from storage
    // 2. Optionally redirect to OIDC provider logout URL

    clearJWTCookies(res);

    return res.status(200).json({
      message: 'Logout successful',
    });
  })
);

export default router;
