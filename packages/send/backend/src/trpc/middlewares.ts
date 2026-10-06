import { PrismaClient } from '@prisma/client';
import { validateJWT } from '@send-backend/auth/jwt';
import {
  extractBearerToken,
  isAccessTokenRevoked,
  validateOIDCToken,
} from '@send-backend/auth/oidc';
import {
  EnvironmentName,
  X_LOGOUT_HEADER,
  getEnvironmentName,
} from '@send-backend/config';
import { fromPrismaV2 } from '@send-backend/models/prisma-helper';
import { getUserByOIDCSubject } from '@send-backend/models/users';
import { Context } from '@send-backend/trpc';
import { PermissionType, allPermissions } from '@send-backend/types/custom';
import { TRPCError } from '@trpc/server';

const prisma = new PrismaClient();

type ContextPlugin = {
  ctx: Context & { permission?: PermissionType };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NextFunction = (p: ContextPlugin | void) => Promise<any>;

/**
 * This middleware checks for OIDC authentication using Bearer tokens
 * It validates tokens via introspection and adds user info to context
 */
export async function isOIDCAuthed(opts: { ctx: Context; next: NextFunction }) {
  const { ctx } = opts;

  // First try OIDC authentication
  const authHeader = ctx?.authorization;
  const token = extractBearerToken(authHeader);

  if (token) {
    // A revoked (but not merely expired) session must lose access immediately —
    // don't fall back to a still-unexpired JWT cookie. Signal the client to log
    // out (#960).
    if (await isAccessTokenRevoked(token)) {
      ctx?.res?.setHeader?.(X_LOGOUT_HEADER, '1');
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    try {
      const validation = await validateOIDCToken(token);

      if (validation.isValid) {
        // Add OIDC user info to context
        ctx.oidcUser = validation.userInfo;
        return opts.next();
      }
    } catch (error) {
      console.error('OIDC validation failed:', error);
    }
  }

  // Fallback to JWT validation for backward compatibility
  const validationResult = validateJWT({
    jwtToken: ctx?.cookies?.jwtToken,
    jwtRefreshToken: ctx?.cookies?.jwtRefreshToken,
  });

  if (validationResult === 'valid') {
    return opts.next();
  }

  // When token is invalid but refresh token is valid. We refresh our token
  if (validationResult === 'shouldRefresh') {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  // If validation fails or if refresh token is not valid, we return FORBIDDEN
  if (!validationResult || validationResult === 'shouldLogin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
}

/**
 * This middleware is used to check if the user has a valid token and associated account information.
 * If the jwt token has expired but the request contains a valid refresh token, we return UNAUTHORIZED to let the client know they should refresh
 * If both token and refresh token are invalid, we return FORBIDDEN
 * Note: This middleware mirrors `requireJWT` from backend/src/middleware.ts
 * These middlewares should be maintained in tandem to avoid unintended behavior
 */
export async function isAuthed(opts: { ctx: Context; next: NextFunction }) {
  // Use the new OIDC-compatible middleware
  return isOIDCAuthed(opts);
}

/**
 * Resolve the id of the authenticated user. When `isOIDCAuthed` set an OIDC
 * identity, the user must exist in our database; otherwise we fall back to the
 * legacy JWT user from the context.
 * Note: This mirrors `getAuthenticatedUserData` from backend/src/middleware.ts
 */
export async function getAuthenticatedUserId(
  ctx: Context
): Promise<string | null> {
  if (ctx.oidcUser?.sub) {
    try {
      const user = await getUserByOIDCSubject(ctx.oidcUser.sub);
      if (user) {
        return String(user.id);
      }
    } catch (error) {
      console.warn('Could not find OIDC user in database:', error);
    }
    // Fail closed. `ctx.user` comes from the `authorization` cookie, which
    // `isOIDCAuthed` never verified on this path, so it can't stand in for a
    // missing OIDC account.
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return ctx.user?.id ?? null;
}

/**
 * Gets a user's permissions for a container and adds it to the context as `permission`.
 * The container is read from the `containerId` field of the procedure input.
 * Note: This middleware mirrors `getGroupMemberPermissions` from backend/src/middleware.ts
 * These middlewares should be maintained in tandem to avoid unintended behavior
 */
export async function getGroupMemberPermission(opts: {
  ctx: Context;
  next: NextFunction;
  getRawInput: () => Promise<unknown>;
}) {
  const { ctx } = opts;

  // `isOIDCAuthed` throws on every denial path, so reaching past this means auth
  // is valid. The sentinel `next` stops it from running the rest of the chain.
  let goodToGo = false;
  await isOIDCAuthed({
    ctx,
    next: async () => {
      goodToGo = true;
    },
  });
  if (!goodToGo) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  const userId = await getAuthenticatedUserId(ctx);
  if (!userId) {
    console.error('No authenticated user data found');
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  const rawInput = await opts.getRawInput();
  const containerId =
    rawInput && typeof rawInput === 'object' && 'containerId' in rawInput
      ? (rawInput.containerId as string | undefined)
      : undefined;

  // Users have full permissions to their own top-level (aka root) folder.
  // Whenever a request doesn't contain a containerId, we assume it's a top-level folder.
  if (!containerId) {
    return opts.next({ ctx: { ...ctx, permission: allPermissions() } });
  }

  let permission: PermissionType;
  try {
    const group = await fromPrismaV2(prisma.group.findFirstOrThrow, {
      where: { container: { id: containerId } },
    });
    const membership = await fromPrismaV2(prisma.membership.findUniqueOrThrow, {
      where: { groupId_userId: { groupId: group.id, userId } },
    });
    permission = membership.permission;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return opts.next({ ctx: { ...ctx, permission } });
}

/**
 * This middleware prevents public login routes to function if the env variable is not enabled
 * This should not be used in production
 **/
export function requirePublicLogin(opts: { ctx: Context; next: NextFunction }) {
  if (process.env?.ALLOW_PUBLIC_LOGIN === 'true') {
    return opts.next();
  }
  throw new TRPCError({ code: 'NOT_IMPLEMENTED' });
}

/**
 * This middleware is used to run only on explicitly declared environments
 * It is used to prevent certain routes from being run in production or stage environments
 **/
export async function useEnvironment(
  opts: {
    ctx: Context;
    next: NextFunction;
  },
  environmentName: EnvironmentName[]
) {
  const runtimeEnvironment = getEnvironmentName();
  if (environmentName.includes(runtimeEnvironment)) {
    return opts.next();
  }
  throw new TRPCError({ code: 'BAD_GATEWAY' });
}
