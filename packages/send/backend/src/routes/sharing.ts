import { Router } from 'express';

import {
  acceptAccessLink,
  checkIfAccessLinkCanBeCreated,
  createAccessLink,
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
