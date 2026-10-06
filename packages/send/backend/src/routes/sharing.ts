import { Router } from 'express';

import {
  acceptAccessLink,
  acceptInvitation,
  checkIfAccessLinkCanBeCreated,
  createAccessLink,
  createInvitationFromAccessLink,
  getAccessLinkChallenge,
  getAccessLinksByUploadId,
  getAccessLinksByUploadIdAndWrappedKey,
  getContainerForAccessLink,
  isAccessLinkValid,
  resetAccessLinkRetryCount,
} from '../models/sharing';

import {
  addErrorHandling,
  SHARING_ERRORS,
  wrapAsyncHandler,
} from '../errors/routes';

import { getDataFromAuthenticatedRequest } from '@send-backend/auth/client';
import { useMetrics } from '@send-backend/metrics';
import { ANALYTICS_EVENTS } from '@send-backend/metrics/events';
import { addExpiryToContainer } from '@send-backend/utils';
import { createRateLimiter } from '../middleware/rate-limit';
import {
  getGroupMemberPermissions,
  requireJWT,
  requireSharePermission,
} from '../middleware';

const router: Router = Router();
const Metrics = useMetrics();

/**
 * @openapi
 * /api/sharing/invite:
 *   post:
 *     summary: Invite users to share a container
 *     tags: [Sharing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               containerName:
 *                 type: string
 *               invitedUsers:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Invitations sent successfully
 *       400:
 *         description: Failed to send invitations
 */
// Request a new hash for a shared container
router.post(
  '/',
  requireJWT,
  getGroupMemberPermissions,
  requireSharePermission,
  // State-changing share action: sensitive tier, keyed per user.
  createRateLimiter('sensitive'),
  addErrorHandling(SHARING_ERRORS.ACCESS_LINK_NOT_CREATED),
  wrapAsyncHandler(async (req, res) => {
    const { uniqueHash } = getDataFromAuthenticatedRequest(req);
    const {
      containerId,
      senderId,
      wrappedKey,
      salt,
      challengeKey,
      challengeSalt,
      challengeCiphertext,
      challengePlaintext,
      expiration,
    }: {
      containerId: string;
      senderId: string;
      wrappedKey: string;
      salt: string;
      challengeKey: string;
      challengeSalt: string;
      challengeCiphertext: string;
      challengePlaintext: string;
      expiration: string;
    } = req.body;
    let permission = '0';
    if (req.body.permission) {
      permission = req.body.permission;
    }

    // check if link can be created
    const canCreateLink = await checkIfAccessLinkCanBeCreated(containerId);

    if (!canCreateLink) {
      return res.status(403).json({
        message:
          'Cannot create access link for this container because it contains files that have been reported for abuse.',
      });
    }

    const accessLink = await createAccessLink(
      containerId,
      senderId,
      wrappedKey,
      salt,
      challengeKey,
      challengeSalt,
      challengeCiphertext,
      challengePlaintext,
      parseInt(permission),
      expiration
    );

    Metrics.capture({
      event: ANALYTICS_EVENTS.ACCESS_LINK_CREATED,
      distinctId: uniqueHash,
      properties: {
        id: accessLink.id,
        expiration,
      },
    });

    await Metrics.shutdown();

    return res.status(200).json({
      id: accessLink.id,
      expiryDate: accessLink.expiryDate,
    });
  })
);

router.get(
  '/:containerId/canCreateAccessLink',
  requireJWT,
  getGroupMemberPermissions,
  requireSharePermission,
  // Authenticated read: loosest tier, keyed per user.
  createRateLimiter('read'),
  wrapAsyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const canCreateLink = await checkIfAccessLinkCanBeCreated(containerId);
    return res.status(200).json({
      canCreateLink,
    });
  })
);

/**
 * @openapi
 * /api/sharing/accept/{invitationId}:
 *   post:
 *     summary: Accept a sharing invitation
 *     tags: [Sharing]
 *     parameters:
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Invitation accepted successfully
 *       404:
 *         description: Invitation not found
 */
// Get the challenge for this hash
router.get(
  '/:linkId/challenge',
  addErrorHandling(SHARING_ERRORS.CHALLENGE_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { linkId } = req.params;
    if (!linkId) {
      res.status(400).json({
        message: 'linkId is required',
      });
    }
    const { challengeKey, challengeSalt, challengeCiphertext } =
      await getAccessLinkChallenge(linkId);
    res.status(200).json({
      challengeKey,
      challengeSalt,
      challengeCiphertext,
    });
  })
);

/**
 * @openapi
 * /api/sharing/reject/{invitationId}:
 *   post:
 *     summary: Reject a sharing invitation
 *     tags: [Sharing]
 *     parameters:
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Invitation rejected successfully
 *       404:
 *         description: Invitation not found
 */
// Respond to the challenge.
// If plaintext matches, we respond with wrapped key
// associated salt
router.post(
  '/:linkId/challenge',
  addErrorHandling(SHARING_ERRORS.CHALLENGE_FAILED),
  wrapAsyncHandler(async (req, res) => {
    const { linkId } = req.params;
    const { challengePlaintext } = req.body;

    const link = await acceptAccessLink(linkId, challengePlaintext);
    const { share, wrappedKey, salt } = link;
    res.status(200).json({
      status: 'success',
      containerId: share.containerId,
      wrappedKey,
      salt,
    });
  })
);

/**
 * @openapi
 * /api/sharing/leave/{containerId}:
 *   post:
 *     summary: Leave a shared container
 *     tags: [Sharing]
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Successfully left the container
 *       404:
 *         description: Container not found
 */
// Get an AccessLink's container and items
router.get(
  '/exists/:linkId',
  addErrorHandling(SHARING_ERRORS.ACCESS_LINK_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { linkId } = req.params;
    res.status(200).json(await isAccessLinkValid(linkId));
  })
);

// Get an AccessLink's container and items
/*
If I want to protect this with permissions, I'd need to:
- not require a login
- get the permissions off of the access link (which points to a share, which points to a container)
- confirm it canRead
*/
router.get(
  '/:linkId',
  addErrorHandling(SHARING_ERRORS.CONTAINER_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { linkId } = req.params;
    const containerWithItems = await getContainerForAccessLink(linkId);

    const itemsWithExpiry = {
      ...containerWithItems,
      items: containerWithItems.items.map((item) => ({
        ...item,
        upload: addExpiryToContainer(item.upload),
      })),
    };

    // We reset the password attempt count on successful retrieval
    await resetAccessLinkRetryCount(linkId);

    res.status(200).json(itemsWithExpiry);
  })
);

// Allow user to use an AccessLink to become a group member for a container
router.post(
  '/:linkId/member/accept',
  requireJWT,
  // State-changing action: sensitive tier, keyed per user.
  createRateLimiter('sensitive'),
  addErrorHandling(SHARING_ERRORS.ACCESS_LINK_NOT_ACCEPTED),
  wrapAsyncHandler(async (req, res) => {
    const { id } = getDataFromAuthenticatedRequest(req);

    const { linkId } = req.params;
    const { challengePlaintext } = req.body ?? {};

    // Becoming a member requires the same proof of access as the recipient
    // read path: the link must be unexpired, and the caller must present the
    // link's challenge plaintext (derivable only with the link's password
    // when one is set). Possession of the link id alone is not sufficient.
    if (typeof challengePlaintext !== 'string' || challengePlaintext === '') {
      res.status(403).json({ message: 'Failed access link challenge' });
      return;
    }

    if (!(await isAccessLinkValid(linkId))) {
      res.status(403).json({ message: 'Access link is invalid or expired' });
      return;
    }

    // Same verification as POST /:linkId/challenge: the stored challenge
    // plaintext must match. On mismatch, no invitation is created.
    const verifiedLink = await acceptAccessLink(
      linkId,
      challengePlaintext
    ).catch(() => null);
    if (!verifiedLink) {
      res.status(403).json({ message: 'Failed access link challenge' });
      return;
    }

    // We create an Invitation for two reasons:
    // - it allows us to reuse the existing `acceptInvitation()`
    // - it serves as record-keeping (e.g., we can prevent someone
    // from re-joining after their access has been revoked)
    const newInvitation = await createInvitationFromAccessLink(linkId, id);
    // The container owner accepting their own access link already has full
    // access, so there is no invitation to accept — return success as a no-op.
    if (!newInvitation) {
      res.status(200).json({ success: true });
      return;
    }
    const result = await acceptInvitation(newInvitation.id);
    res.status(200).json(result);
  })
);

// Get all the access links for an individual file identified by the upload id.
//
// This route has no containerId to feed getGroupMemberPermissions, so the
// container-scoped permission middleware cannot gate it. Authorization is
// resolved from the upload id instead: the model queries are scoped to the
// caller's owned containers, so a caller only ever sees links for uploads whose
// container they own. An id they do not own yields an empty list rather than a
// distinguishable error, so it cannot be used as an existence oracle.
router.get(
  '/:uploadId/links',
  requireJWT,
  // Authenticated read: loosest tier, keyed per user.
  createRateLimiter('read'),
  addErrorHandling(SHARING_ERRORS.ACCESS_LINK_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { uploadId } = req.params;
    const { id: ownerId } = getDataFromAuthenticatedRequest(req);

    const type = req.query?.type;

    if (type === 'file') {
      const result = await getAccessLinksByUploadIdAndWrappedKey(
        uploadId,
        ownerId
      );
      return res.status(200).json(result);
    }
    const result = await getAccessLinksByUploadId(uploadId, ownerId);
    return res.status(200).json(result);
  })
);

// Compatibility endpoint for clients that still call it after creating a link
// without a password. The server does not persist, log, or echo anything from
// the request body: the link secret lives only in the URL fragment shown to the
// owner at creation time. The body is accepted and ignored.
router.post('/:linkId/add-password', (req, res) => {
  const { linkId } = req.params;
  return res.status(200).json({ id: linkId });
});

export default router;
