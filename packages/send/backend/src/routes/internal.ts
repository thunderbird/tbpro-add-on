import { UserTier } from '@prisma/client';
import { requireServiceAuth } from '@send-backend/auth/service-auth';
import { wrapAsyncHandler } from '@send-backend/errors/routes';
import { getUsedStorage } from '@send-backend/models';
import { getUserByOIDCSubject } from '@send-backend/models/users';
import { getStorageLimitForTier } from '@send-backend/utils/storageLimits';
import { Router } from 'express';

/**
 * Internal service-to-service endpoints (#1216 / #1248). Not for end users:
 * every route is guarded by requireServiceAuth, which also emits the one
 * structured audit line per request. See auth/service-auth.ts for the allowlist
 * security model and what the audit line does and does not record.
 */
const router: Router = Router();

/**
 * @openapi
 * /api/internal/users/{sub}/storage:
 *   get:
 *     tags:
 *       - Internal
 *     summary: Per-user active storage usage (service-to-service)
 *     description: >
 *       Reports a user's active Send storage usage and limit in bytes, for the
 *       Thunderbird Accounts backend (issue #1216). Requires a Keycloak
 *       client-credentials token whose client is on the
 *       INTERNAL_ALLOWED_CLIENT_IDS allowlist. The user is identified by
 *       Keycloak subject; legacy users without an OIDC subject are out of scope
 *       and answer 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sub
 *         required: true
 *         schema:
 *           type: string
 *         description: Keycloak subject (sub) of the user
 *     responses:
 *       200:
 *         description: Active usage and limit in bytes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 active:
 *                   type: number
 *                   description: Total size of active (non-expired) uploads in bytes
 *                 limit:
 *                   type: number
 *                   description: Storage limit for the user's tier in bytes
 *       401:
 *         description: Missing, invalid or inactive token
 *       403:
 *         description: Token valid but its client is not allowlisted
 *       404:
 *         description: No user with this Keycloak subject
 *       503:
 *         description: Token introspection unavailable (fail closed)
 */
router.get(
  '/users/:sub/storage',
  requireServiceAuth(),
  wrapAsyncHandler(async (req, res) => {
    const user = await getUserByOIDCSubject(req.params.sub);
    if (!user) {
      // Unknown subject — includes legacy password-account users, who have no
      // oidcSubject and are out of scope for this feature (#1216).
      return res.status(404).json({
        message: 'User not found',
        error: 'user_not_found',
      });
    }

    // Compute usage the same way the user-facing path does (see auth/client.ts
    // getStorageLimit): EPHEMERAL tier counts only non-expired uploads.
    const hasLimitedStorage = user.tier === UserTier.EPHEMERAL;
    const { active } = await getUsedStorage(user.id, hasLimitedStorage);

    // Usage numbers must never be served stale by an intermediary cache.
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      active,
      limit: getStorageLimitForTier(user.tier),
    });
  })
);

export default router;
