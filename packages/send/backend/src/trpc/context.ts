import * as trpcExpress from '@trpc/server/adapters/express';
import {
  getDataFromAuthenticatedRequest,
  getStorageLimit,
} from '../auth/client';
import { getCookie } from '../utils';

export const createContext = ({
  req,
}: trpcExpress.CreateExpressContextOptions) => {
  const jwtToken = getCookie(req?.headers?.cookie, 'authorization');
  const jwtRefreshToken = getCookie(req?.headers?.cookie, 'refresh_token');

  // Make user data available to all trpc requests unless the user is not authenticated
  try {
    const { id, email, uniqueHash, tier } =
      getDataFromAuthenticatedRequest(req);

    const { daysToExpiry, hasLimitedStorage } = getStorageLimit(req);

    return {
      // req, // Include request object for OIDC middleware
      authorization: req.headers?.authorization || null,
      user: {
        id: id.toString(),
        email,
        uniqueHash,
        tier,
        daysToExpiry,
        hasLimitedStorage,
      },
      cookies: {
        jwtToken,
        jwtRefreshToken,
      },
      oidcUser: null, // Will be populated by OIDC middleware
    };
  } catch {
    // If the user is not authenticated, we return only the cookies
    return {
      // req, // Include request object for OIDC middleware
      authorization: req.headers?.authorization || null,
      user: null,
      cookies: {
        jwtToken,
        jwtRefreshToken,
      },
      oidcUser: null, // Will be populated by OIDC middleware
    };
  }
};
