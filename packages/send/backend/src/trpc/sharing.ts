import {
  deleteAccessLink,
  getAccessLinkRetryCount,
} from '@send-backend/models/sharing';
import { z } from 'zod';
import { router, publicProcedure as t } from '../trpc';
import { TRPCError } from '@trpc/server';
import { getAuthenticatedUserId, isAuthed } from './middlewares';
import { markAccessLinkAsPasswordless } from '../models/containers';

async function readPasswordRetryCount(id: string) {
  let retryCount = 0;
  try {
    const res = await getAccessLinkRetryCount(id);
    retryCount = res.retryCount;
  } catch (error) {
    console.error('Error getting password retry count', error);
  }
  return { id, retryCount };
}

export const sharingRouter = router({
  /**
   * @openapi
   * /trpc/addPasswordToAccessLink:
   *   post:
   *     tags:
   *       - Sharing
   *     summary: Acknowledge a legacy add-password call
   *     description: >-
   *       Compatibility endpoint for clients that still call it after creating a
   *       link without a password. Nothing from the request is persisted, logged,
   *       or echoed back; the link secret lives only in the URL fragment shown to
   *       the owner at creation time.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               linkId:
   *                 type: string
   *                 description: ID of the access link
   *               password:
   *                 type: string
   *                 description: Accepted for compatibility and ignored
   *     responses:
   *       200:
   *         description: Acknowledged
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *                   description: ID of the access link
   */
  addPasswordToAccessLink: t
    .input(z.object({ linkId: z.string(), password: z.string().optional() }))
    .mutation(async ({ input }) => {
      return { id: input.linkId };
    }),

  markAccessLinkAsPasswordless: t
    .use(isAuthed)
    .input(z.object({ linkId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = await getAuthenticatedUserId(ctx);
      if (!userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      try {
        const { id } = await markAccessLinkAsPasswordless(input.linkId, userId);
        return { id };
      } catch (error) {
        // Also covers links the caller doesn't own, so we don't reveal which
        // link ids exist.
        console.error('Error marking access link as passwordless', error);
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }),

  /**
   * @openapi
   * /trpc/incrementPasswordRetryCount:
   *   post:
   *     tags:
   *       - Sharing
   *     summary: Get password retry count (legacy)
   *     description: >-
   *       Kept for older clients. Failed attempts are now counted by the
   *       challenge endpoint, so this no longer changes anything and only
   *       returns the current retry count.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               linkId:
   *                 type: string
   *                 description: ID of the access link
   *     responses:
   *       200:
   *         description: Current retry count
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *                   description: ID of the access link
   *                 retryCount:
   *                   type: number
   *                   description: Current retry count
   */
  // Server-side counting happens in POST /api/sharing/:linkId/challenge (#1006).
  incrementPasswordRetryCount: t
    .input(z.object({ linkId: z.string() }))
    .mutation(async ({ input }) => readPasswordRetryCount(input.linkId)),

  /**
   * @openapi
   * /trpc/getPasswordRetryCount:
   *   get:
   *     tags:
   *       - Sharing
   *     summary: Get password retry count
   *     description: Retrieves the current retry count for password attempts on an access link
   *     parameters:
   *       - in: query
   *         name: input
   *         schema:
   *           type: object
   *           properties:
   *             linkId:
   *               type: string
   *               description: ID of the access link
   *     responses:
   *       200:
   *         description: Current retry count
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *                   description: ID of the access link
   *                 retryCount:
   *                   type: number
   *                   description: Current retry count
   */
  getPasswordRetryCount: t
    .input(z.object({ linkId: z.string() }))
    .query(async ({ input }) => readPasswordRetryCount(input.linkId)),

  /**
   * @openapi
   * /trpc/deleteAccessLink:
   *   post:
   *     tags:
   *       - Sharing
   *     summary: Delete access link
   *     description: Deletes an existing access link
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               linkId:
   *                 type: string
   *                 description: ID of the access link to delete
   *     responses:
   *       200:
   *         description: Access link deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Whether the deletion was successful
   *                 message:
   *                   type: string
   *                   description: Success or error message
   *                 id:
   *                   type: string
   *                   description: ID of the deleted access link
   *       401:
   *         description: Unauthorized - Authentication required
   *       404:
   *         description: Access link not found or not owned by the caller
   *       500:
   *         description: Internal server error
   */
  deleteAccessLink: t
    .use(isAuthed)
    .input(z.object({ linkId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = await getAuthenticatedUserId(ctx);
      if (!userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      try {
        const { id } = await deleteAccessLink(input.linkId, userId);
        return {
          success: true,
          message: 'Access link deleted successfully',
          id,
        };
      } catch (error) {
        // Also covers links the caller doesn't own, so we don't reveal which
        // link ids exist.
        console.error('Error deleting access link', error);
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }),
});
