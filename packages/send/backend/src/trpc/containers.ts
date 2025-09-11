import { ContainerType } from '@prisma/client';
import {
  IS_USING_BUCKET_STORAGE,
  TOTAL_STORAGE_LIMIT,
} from '@send-backend/config';
import {
  getAccessLinksForContainer as getAccessLinks,
  getContainerWithoutAncestors,
  getDefaultContainerForOwner,
  setContainerAsDefault,
} from '@send-backend/models/containers';
import { getAllUserGroupContainers } from '@send-backend/models/users';
import { addExpiryToContainer } from '@send-backend/utils';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, publicProcedure as t } from '../trpc';
import { isAuthed } from './middlewares';

export const containersRouter = router({
  /**
   * @openapi
   * /trpc/getTotalUsedStorage:
   *   get:
   *     tags:
   *       - Storage
   *     summary: Get total storage usage statistics
   *     description: Returns the total storage used by the user, including active and expired storage
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Storage usage statistics
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 expired:
   *                   type: number
   *                   description: Total size of expired uploads in bytes
   *                 active:
   *                   type: number
   *                   description: Total size of active uploads in bytes
   *                 limit:
   *                   type: number
   *                   description: Total storage limit in bytes
   */
  getTotalUsedStorage: t.use(isAuthed).query(async ({ ctx }) => {
    const response = {
      expired: 0,
      active: 0,
      limit: TOTAL_STORAGE_LIMIT,
    };

    try {
      const userId = ctx.user.id;
      const folders = await getAllUserGroupContainers(
        userId,
        ContainerType.FOLDER
      );

      // If the user has a limited storage, we need to calculate the total size of the active uploads and the expired uploads
      if (ctx.user.hasLimitedStorage) {
        // Get the total size of all the uploads that haven't expired
        const expired = folders
          .flatMap((folder) =>
            folder.items
              // Add expiry information to each upload
              .map((item) => addExpiryToContainer(item.upload))
              // Filter out the expired uploads
              .filter((item) => item.expired === true)
              // Get the size of each upload
              .map((item) => item.size)
          )
          // Make a sum of all the sizes that have expired
          .reduce((sizeA, sizeB) => sizeA + Number(sizeB), 0);

        const active = folders
          .flatMap((folder) =>
            folder.items
              // Add expiry information to each upload
              .map((item) => addExpiryToContainer(item.upload))
              // Filter out the expired uploads
              .filter((item) => item.expired === false)
              // Get the size of each upload
              .map((item) => item.size)
          )
          // Make a sum of all the sizes that haven't expired
          .reduce((sizeA, sizeB) => sizeA + Number(sizeB), 0);

        response.active = active;
        response.expired = expired;
      }
      const active = folders
        // Make a sum of all the sizes that haven't expired
        .flatMap((folder) => folder.items.map((item) => item.upload.size))
        .reduce((sizeA, sizeB) => sizeA + Number(sizeB), 0);

      response.active = active;
      response.expired = 0;
    } catch {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while calculating the total storage used',
      });
    }
    return response;
  }),

  /**
   * @openapi
   * /trpc/getAccessLinksForContainer:
   *   get:
   *     tags:
   *       - Containers
   *     summary: Get access links for a container
   *     description: Returns all access links associated with a specific container
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: input
   *         schema:
   *           type: object
   *           properties:
   *             containerId:
   *               type: number
   *               description: ID of the container
   *     responses:
   *       200:
   *         description: List of access links for the container
   */
  getAccessLinksForContainer: t
    .use(isAuthed)
    .input(z.object({ containerId: z.string() }))
    .query(async ({ input }) => {
      const accessLinks = await getAccessLinks(input.containerId);
      return accessLinks;
    }),

  /**
   * @openapi
   * /trpc/getStorageType:
   *   get:
   *     tags:
   *       - Storage
   *     summary: Get storage type configuration
   *     description: Returns whether the system is using bucket storage or not
   *     responses:
   *       200:
   *         description: Storage type configuration
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 isBucketStorage:
   *                   type: boolean
   *                   description: Whether the system is using bucket storage
   */
  getStorageType: t.query(async () => {
    if (typeof IS_USING_BUCKET_STORAGE === 'boolean') {
      return { isBucketStorage: IS_USING_BUCKET_STORAGE };
    }
    return { isBucketStorage: false };
  }),

  /**
   * @openapi
   * /trpc/getDefaultFolder:
   *   get:
   *     tags:
   *       - Containers
   *     summary: Get user's default folder
   *     description: Returns the default folder/container for the authenticated user
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Default folder information
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *                   description: ID of the default folder
   *       404:
   *         description: Default folder not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: object
   *                   properties:
   *                     code:
   *                       type: string
   *                       example: "NOT_FOUND"
   *                     message:
   *                       type: string
   *                       example: "An error occurred while fetching the default folder"
   */
  getDefaultFolder: t.use(isAuthed).query(
    async ({
      ctx: {
        user: { id },
      },
    }) => {
      const response = {
        id: '',
      };

      // get the default folder for the user where the isDefault flag is true
      const defaultFolder = await getDefaultContainerForOwner(id);
      if (defaultFolder) {
        response.id = defaultFolder.id;
        return response;
      }

      // If we don't have a default folder, we need to get all the folders for the user and set oldest one as default
      try {
        const containersWithoutAncestors =
          await getContainerWithoutAncestors(id);

        // If the user has no folders at all, we just return an empty response
        if (!containersWithoutAncestors.length) {
          return response;
        }

        // Make sure we tag the first container (by creation date) as default so we don't have issues later
        const sortedContainers = containersWithoutAncestors.sort((a, b) =>
          a.createdAt > b.createdAt ? 1 : -1
        );

        await setContainerAsDefault(sortedContainers?.[0]?.id, id);
        response.id = sortedContainers?.[0]?.id;

        return response;
      } catch {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'An error occurred while fetching the default folder',
        });
      }
    }
  ),
});
