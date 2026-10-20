import {
  deleteAccessLink,
  getAccessLinkRetryCount,
  incrementAccessLinkRetryCount,
} from '@send-backend/models/sharing';
import {
  cleanupExpiredEncryptedPassphrases,
  countRecentEncryptedPassphrases,
  getEncryptedPassphrase,
  MAX_ENCRYPTED_PASSPHRASES_PER_WINDOW,
  storeEncryptedPassphrase,
} from '@send-backend/models/verification';
import { verificationEmitter } from '@send-backend/ws/verify';
import { z } from 'zod';
import { router, publicProcedure as t } from '../trpc';
import { TRPCError } from '@trpc/server';
import { getAuthenticatedUserId, isAuthed } from './middlewares';
import { markAccessLinkAsPasswordless } from '../models/containers';

// The client sends base64 of AES-GCM/AES-KW output: a 6-word passphrase is
// <=552 chars, the wrapped key <=320 and each 16-byte salt <=128.
const base64 = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/);

async function requireUserId(
  ctx: Parameters<typeof getAuthenticatedUserId>[0]
) {
  const userId = await getAuthenticatedUserId(ctx);
  if (!userId) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return userId;
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
   *     summary: Increment password retry count
   *     description: Increments the retry count for password attempts on an access link
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
   *         description: Retry count incremented successfully
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
   *                   description: Updated retry count
   */
  incrementPasswordRetryCount: t
    .input(z.object({ linkId: z.string() }))
    .mutation(async ({ input }) => {
      const id = input.linkId;
      let retryCount = 0;
      try {
        const res = await incrementAccessLinkRetryCount(input.linkId);
        retryCount = res.retryCount;
      } catch (error) {
        console.error('Error incrementing password retry count', error);
      }
      return { id, retryCount };
    }),

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
    .query(async ({ input }) => {
      const id = input.linkId;
      let retryCount = 0;
      try {
        const res = await getAccessLinkRetryCount(input.linkId);
        retryCount = res.retryCount;
      } catch (error) {
        console.error('Error getting password retry count', error);
      }
      return { id, retryCount };
    }),

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

  // Stores encrypted passphrase data
  shareEncryptedPassphrase: t
    .use(isAuthed)
    .input(
      z.object({
        encryptedPassphrase: base64(4096),
        wrappedEncryptionKey: base64(2048),
        salt: base64(512),
        codeSalt: base64(512),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = await requireUserId(ctx);
      const { encryptedPassphrase, wrappedEncryptionKey, salt, codeSalt } =
        input;

      if (
        (await countRecentEncryptedPassphrases(userId)) >=
        MAX_ENCRYPTED_PASSPHRASES_PER_WINDOW
      ) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS' });
      }
      await cleanupExpiredEncryptedPassphrases();

      // Store the encrypted passphrase data in the database
      const result = await storeEncryptedPassphrase(
        {
          encryptedPassphrase,
          wrappedEncryptionKey,
          salt,
          codeSalt,
        },
        userId
      );

      if (result.id) {
        // Notify any listeners waiting for the passphrase
        verificationEmitter.emit('shared_passphrase', { id: result.id });
        return { success: true, id: result.id };
      } else {
        throw new Error('Failed to store verification data');
      }
    }),

  // Gets encrypted passphrase data using its ID, for the user who stored it.
  getEncryptedPassphrase: t
    .use(isAuthed)
    .input(z.string())
    .query(async ({ input, ctx }) => {
      const userId = await requireUserId(ctx);
      return getEncryptedPassphrase(input, userId);
    }),
});
