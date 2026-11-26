import { ContainerType } from '@prisma/client';
import { Router } from 'express';
import {
  createItem,
  deleteItem,
  getContainerInfo,
  getContainerWithDescendants,
  isUploadOwnedBy,
  reportUpload,
  updateItemName,
} from '../models';

import {
  getAuthenticatedUserData,
  getGroupMemberPermissions,
  reject,
  renameBodyProperty,
  requireAdminPermission,
  requireJWT,
  requireReadPermission,
  requireUploadAccess,
  requireWritePermission,
} from '../middleware';
import { createRateLimiter } from '../middleware/rate-limit';

import { ITEM_NOT_FOUND } from '../errors/models';
import {
  addErrorHandling,
  CONTAINER_ERRORS,
  wrapAsyncHandler,
} from '../errors/routes';

import { burnFolder } from '../models/sharing';

import {
  createContainer,
  getAccessLinksForContainer,
  getContainerWithAncestors,
  getItemsInContainer,
  updateContainerName,
} from '../models/containers';

import {
  getDataFromAuthenticatedRequest,
  getStorageLimit,
} from '@send-backend/auth/client';
import { addExpiryToContainer } from '@send-backend/utils';

const router: Router = Router();

// An item lookup that matches nothing in the container (missing, or in another
// container) answers 404, with the same body either way.
const itemNotFound = { [ITEM_NOT_FOUND]: CONTAINER_ERRORS.ITEM_NOT_FOUND };

export interface TreeNode {
  id: string;
  children: TreeNode[];
}

export function flattenDescendants(tree: TreeNode): string[] {
  if (!tree || !tree.id) {
    return [];
  }
  const children = tree?.children?.length > 0 ? tree.children : [];
  return [
    ...children.flatMap((child: TreeNode) => flattenDescendants(child)),
    tree.id,
  ];
}

/**
 * @openapi
 * /api/containers/{containerId}:
 *   get:
 *     summary: Get a container and its items
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Container retrieved successfully
 *       404:
 *         description: Container not found
 */
// Get a container and its items
// Add the ancestor folder path as a property.
router.get(
  '/:containerId',
  requireJWT,
  getGroupMemberPermissions,
  requireReadPermission,
  // Authenticated read: loosest tier, keyed per user.
  createRateLimiter('read'),
  addErrorHandling(CONTAINER_ERRORS.CONTAINER_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const container = await getItemsInContainer(containerId);
    const { hasLimitedStorage } = getStorageLimit(req);

    if (!container) {
      throw new Error();
    }

    if (container.parentId) {
      container['parent'] = await getContainerWithAncestors(container.parentId);
    }

    const itemsWithExpiry = {
      ...container,
      items: container.items.map((item) => ({
        ...item,
        upload: addExpiryToContainer(item.upload),
      })),
    };

    res.status(200).json(hasLimitedStorage ? itemsWithExpiry : container);
  })
);

/**
 * @openapi
 * /api/containers/{containerId}/links:
 *   get:
 *     summary: Get all Access Links for a container
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Access Links retrieved successfully
 *       404:
 *         description: Access Links not found
 */
// Get all Access Links for a container
router.get(
  '/:containerId/links',
  requireJWT,
  getGroupMemberPermissions,
  requireReadPermission,
  // Authenticated read: loosest tier, keyed per user.
  createRateLimiter('read'),
  addErrorHandling(CONTAINER_ERRORS.ACCESS_LINKS_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const links = await getAccessLinksForContainer(containerId);
    res.status(200).json(links);
  })
);

/**
 * @openapi
 * /api/containers:
 *   post:
 *     summary: Create a new container
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [FOLDER, CONVERSATION]
 *     responses:
 *       201:
 *         description: Container created successfully
 *       400:
 *         description: Failed to create container
 */
// Create a container
// When creating a subfolder, the front-end will pass in the parent folder id
// as `req.body.parentId`. But, to use `getPermissions`, we need to rename that property
// to `req.body.containerId`.
// `renameBodyProperty` is a no-op when creating a top-level folder
router.post(
  '/',
  requireJWT,
  renameBodyProperty('parentId', 'containerId'),
  getGroupMemberPermissions,
  requireWritePermission,
  // State-changing action: sensitive tier, keyed per user.
  createRateLimiter('sensitive'),
  addErrorHandling(CONTAINER_ERRORS.CONTAINER_NOT_CREATED),
  wrapAsyncHandler(async (req, res) => {
    const {
      name,
      type,
    }: {
      name: string;
      type: ContainerType;
    } = req.body;

    const { id } = getDataFromAuthenticatedRequest(req);

    const ownerId = id;

    let shareOnly = false;
    if (req.body.shareOnly) {
      shareOnly = req.body.shareOnly;
    }

    const parentId = req.body.containerId;

    const container = await createContainer(
      name.trim().toLowerCase(),
      ownerId!,
      type,
      parentId,
      shareOnly
    );
    res.status(201).json({
      message: 'Container created',
      container,
    });
  })
);

/**
 * @openapi
 * /api/containers/{containerId}/rename:
 *   post:
 *     summary: Rename a container
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Container renamed successfully
 *       400:
 *         description: Failed to rename container
 */
// Rename a container
router.post(
  '/:containerId/rename',
  requireJWT,
  getGroupMemberPermissions,
  requireWritePermission,
  // State-changing action: sensitive tier, keyed per user.
  createRateLimiter('sensitive'),
  addErrorHandling(CONTAINER_ERRORS.CONTAINER_NOT_RENAMED),
  wrapAsyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const { name } = req.body;
    const container = await updateContainerName(containerId, name);
    res.status(200).json(container);
  })
);

/**
 * @openapi
 * /api/containers/{containerId}:
 *   delete:
 *     summary: Delete a container
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Container deleted successfully
 *       404:
 *         description: Container not found
 */
// TODO: think about whether we can be admin of a folder that contains folders we don't own.
router.delete(
  '/:containerId',
  requireJWT,
  getGroupMemberPermissions,
  requireAdminPermission,
  // State-changing action: sensitive tier, keyed per user.
  createRateLimiter('sensitive'),
  addErrorHandling(CONTAINER_ERRORS.CONTAINER_NOT_DELETED),
  wrapAsyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const root = await getContainerWithDescendants(containerId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idArray = flattenDescendants(root as any);

    const burnPromises = idArray.map((id: string) =>
      burnFolder(id, true /* shouldDeleteUpload */)
    );

    const result = await Promise.all(burnPromises);
    res.status(200).json({
      result,
    });
  })
);
// everything above this line is confirmed for q1-dogfood use
// ==================================================================================

/**
 * @openapi
 * /api/containers/{containerId}/item:
 *   post:
 *     summary: Add an item to a container
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               uploadId:
 *                 type: integer
 *               type:
 *                 type: string
 *               wrappedKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item added successfully
 *       400:
 *         description: Failed to add item
 */
// Add an Item
router.post(
  '/:containerId/item',
  getGroupMemberPermissions,
  requireWritePermission,
  // State-changing action: sensitive tier, keyed per user.
  createRateLimiter('sensitive'),
  addErrorHandling(CONTAINER_ERRORS.ITEM_NOT_CREATED),
  wrapAsyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const { name, uploadId, type, wrappedKey, multipart, totalSize } = req.body;
    // An item may only reference an upload the caller owns.
    const userId = getAuthenticatedUserData(req)?.id;
    if (
      !userId ||
      typeof uploadId !== 'string' ||
      !(await isUploadOwnedBy(uploadId, userId))
    ) {
      return reject(res);
    }
    try {
      const item = await createItem(
        name,
        containerId,
        uploadId,
        type,
        wrappedKey,
        multipart ? true : false, // Convert to boolean
        totalSize
      );
      res.status(200).json(item);
    } catch (error) {
      console.error('Error creating item:', error);
      res
        .status(CONTAINER_ERRORS.ITEM_NOT_CREATED.statusCode)
        .json({ message: CONTAINER_ERRORS.ITEM_NOT_CREATED.message });
    }
  })
);

/**
 * @openapi
 * /api/containers/{containerId}/item/{itemId}:
 *   delete:
 *     summary: Remove an item from a container
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Item removed successfully
 *       404:
 *         description: Item not found in this container
 */
router.delete(
  '/:containerId/item/:itemId',
  getGroupMemberPermissions,
  requireWritePermission,
  // State-changing action: sensitive tier, keyed per user.
  createRateLimiter('sensitive'),
  addErrorHandling(CONTAINER_ERRORS.ITEM_NOT_DELETED, itemNotFound),
  wrapAsyncHandler(async (req, res) => {
    const { containerId, itemId } = req.params;
    const userId = getAuthenticatedUserData(req)?.id;
    if (!userId) {
      return reject(res);
    }
    // Defaults to true; either spelling of the flag can turn it off.
    const shouldDeleteUpload =
      req?.body?.shouldDeleteUpload !== false &&
      req?.body?.shouldDeleteContent !== false;
    const { wrappedKey } = await deleteItem(
      Number.parseInt(itemId),
      containerId,
      userId,
      shouldDeleteUpload
    );
    return res.status(202).json({ wrappedKey });
  })
);

/**
 * @openapi
 * /api/containers/{containerId}/item/{itemId}/rename:
 *   post:
 *     summary: Rename an item in a container
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item renamed successfully
 *       400:
 *         description: Failed to rename item
 *       404:
 *         description: Item not found in this container
 */
// Rename an item in a container
router.post(
  '/:containerId/item/:itemId/rename',
  getGroupMemberPermissions,
  requireWritePermission,
  // State-changing action: sensitive tier, keyed per user.
  createRateLimiter('sensitive'),
  addErrorHandling(CONTAINER_ERRORS.ITEM_NOT_RENAMED, itemNotFound),
  wrapAsyncHandler(async (req, res) => {
    const { containerId, itemId } = req.params;
    const { name } = req.body;
    const item = await updateItemName(Number.parseInt(itemId), containerId, name);
    res.status(200).json(item);
  })
);

/**
 * @openapi
 * /api/containers/{containerId}/report:
 *   post:
 *     summary: Report an upload in a container for abuse review
 *     description: >
 *       Queues the upload for admin review without blocking it. Requires proof
 *       of access to this container: a live share link (`linkId`) to it, or
 *       signed-in membership. The upload must be in this container.
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               uploadId:
 *                 type: string
 *                 format: uuid
 *               linkId:
 *                 type: string
 *             required:
 *               - uploadId
 *     responses:
 *       200:
 *         description: Report received and pending review
 *       400:
 *         description: uploadId or containerId is not a uuid
 *       403:
 *         description: No proof of access to the upload in this container
 */
router.post(
  '/:containerId/report',
  createRateLimiter('sensitive'),
  requireUploadAccess,
  addErrorHandling(CONTAINER_ERRORS.ITEM_NOT_REPORTED),
  wrapAsyncHandler(async (req, res) => {
    await reportUpload(req.body.uploadId);
    res.status(200).json({ message: 'reported successfully' });
  })
);

/**
 * @openapi
 * /api/containers/{containerId}/info:
 *   get:
 *     summary: Get container info
 *     tags: [Containers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Container info retrieved successfully
 *       404:
 *         description: Container info not found
 */
// Get container info
router.get(
  '/:containerId/info',
  getGroupMemberPermissions,
  // Authenticated read: loosest tier, keyed per user.
  createRateLimiter('read'),
  addErrorHandling(CONTAINER_ERRORS.INFO_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const container = await getContainerInfo(containerId);
    res.status(200).json(container);
  })
);

export default router;
