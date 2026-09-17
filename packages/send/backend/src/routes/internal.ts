import { UserTier } from '@prisma/client';
import {
  requireServiceAuth,
  type RequestWithServiceCaller,
} from '@send-backend/auth/service-auth';
import { wrapAsyncHandler } from '@send-backend/errors/routes';
import { getUsedStorage } from '@send-backend/models';
import { getUserByOIDCSubject } from '@send-backend/models/users';
import { getStorageLimitForTier } from '@send-backend/utils/storageLimits';
import { Router } from 'express';

/**
 * Internal service-to-service endpoints (#1216 / #1248). Not for end users:
 * every route is guarded by requireServiceAuth (see auth/service-auth.ts for
 * the allowlist security model) and emits one structured audit line per
 * request. Storage *values* are never logged, only the outcome and latency.
 */
const router: Router = Router();

/**
 * Emit a single structured audit line for an internal request. Deliberately
 * excludes any storage value — only who called, whose record, the outcome
 * status, and how long it took.
 */
function auditInternalRequest(fields: {
  route: string;
  clientId: string;
  sub: string;
  status: number;
  latencyMs: number;
}): void {
  console.info(
    JSON.stringify({
      msg: 'internal_request',
      route: fields.route,
      clientId: fields.clientId,
      sub: fields.sub,
      status: fields.status,
      latencyMs: fields.latencyMs,
    })
  );
}

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
    const startedAt = Date.now();
    const { sub } = req.params;
    const clientId =
      (req as RequestWithServiceCaller).serviceCaller?.clientId ?? 'unknown';
    const route = 'GET /api/internal/users/:sub/storage';

    const finish = (status: number) => {
      auditInternalRequest({
        route,
        clientId,
        sub,
        status,
        latencyMs: Date.now() - startedAt,
      });
    };

    try {
      const user = await getUserByOIDCSubject(sub);
      if (!user) {
        // Unknown subject — includes legacy password-account users, who have no
        // oidcSubject and are out of scope for this feature (#1216).
        finish(404);
        return res.status(404).json({
          message: 'User not found',
          error: 'user_not_found',
        });
      }

      // Compute usage the same way the user-facing path does (see auth/client.ts
      // getStorageLimit): EPHEMERAL tier counts only non-expired uploads.
      const hasLimitedStorage = user.tier === UserTier.EPHEMERAL;
      const { active } = await getUsedStorage(user.id, hasLimitedStorage);
      const limit = getStorageLimitForTier(user.tier);

      finish(200);
      // Usage numbers must never be served stale by an intermediary cache.
      res.set('Cache-Control', 'no-store');
      return res.status(200).json({ active, limit });
    } catch (err) {
      // A thrown lookup/computation still gets its audit line — the failure
      // case is the one the audit trail most needs. The error itself is
      // rethrown so wrapAsyncHandler -> the global error handler produces the
      // usual 500 response.
      finish(500);
      throw err;
    }
  })
);

export default router;
