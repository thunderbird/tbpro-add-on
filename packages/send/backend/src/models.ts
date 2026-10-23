import { ContainerType, ItemType, Prisma, PrismaClient } from '@prisma/client';
import {
  BaseError,
  CONTAINER_NOT_FOUND,
  ITEM_NOT_CREATED,
  ITEM_NOT_DELETED,
  ITEM_NOT_FOUND,
  ITEM_NOT_UPDATED,
  SESSION_NOT_CREATED,
  SESSION_NOT_DELETED,
  SESSION_NOT_FOUND,
  UPLOAD_NOT_REPORTED,
} from './errors/models';
import { fromPrismaV2, fromPrismaV3 } from './models/prisma-helper';
import { getAllUserGroupContainers } from './models/users';
import {
  CLEANUP_BATCH_SIZE,
  CLEANUP_CONCURRENCY,
  CleanupOptions,
  claimBytes,
  clearPendingUploads,
  getOrphanMinAgeHours,
  getReservedBytes,
  hoursAgo,
  logDryRun,
  releasePendingUploads,
} from './models/pendingUploads';
import { addExpiryToContainer } from './utils';
import { verifyOwnedUploadId } from './utils/ownedUploadId';
import { mapLimit } from './utils/mapLimit';
import storage from './storage';
const prisma = new PrismaClient();

// Rename only needs container scope: WRITE on the folder covers renaming any
// item in it. Upload ownership is required only where the upload is destroyed.
export async function updateItemName(
  itemId: number,
  containerId: string,
  name: string
) {
  const query = {
    where: {
      id: itemId,
      containerId,
    },
    data: {
      name,
      updatedAt: new Date(),
    },
  };

  try {
    return await prisma.item.update(query);
  } catch (error) {
    console.error(error);
    // P2025: no item with this id in this container.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new BaseError(ITEM_NOT_FOUND);
    }
    throw new BaseError(ITEM_NOT_UPDATED);
  }
}

export async function reportUpload(uploadId: string) {
  try {
    return await prisma.upload.update({
      where: {
        id: uploadId,
      },
      data: {
        reported: true,
        reportedAt: new Date(),
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    throw new Error(UPLOAD_NOT_REPORTED);
  }
}

export async function createItem(
  name: string,
  containerId: string,
  uploadId: string,
  type: ItemType,
  wrappedKey: string,
  multipart = false,
  totalSize?: number
) {
  const query = {
    data: {
      createdAt: new Date(),
      updatedAt: new Date(),
      name,
      wrappedKey,
      type,
      multipart,
      totalSize,
      upload: {
        connect: {
          id: uploadId,
        },
      },
      container: {
        connect: {
          id: containerId,
        },
      },
    },
  };

  return await fromPrismaV2(prisma.item.create, query, ITEM_NOT_CREATED);
}

// Matches an item only within the given container and only when the caller
// owns its upload.
function ownedItemInContainer(
  id: number,
  containerId: string,
  ownerId: string
) {
  return { id, containerId, upload: { ownerId } };
}

export async function isUploadOwnedBy(uploadId: string, ownerId: string) {
  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, ownerId },
    select: { id: true },
  });
  return upload !== null;
}

export async function deleteItem(
  id: number,
  containerId: string,
  ownerId: string,
  shouldDeleteUpload = false
) {
  const { wrappedKey, uploadIds } = await prisma
    .$transaction(async (tx) => {
      const item = await tx.item.findFirst({
        where: ownedItemInContainer(id, containerId, ownerId),
        select: { wrappedKey: true },
      });
      if (!item) {
        throw new BaseError(ITEM_NOT_FOUND);
      }

      // find related parts (multipart siblings share a wrappedKey), limited
      // to the same container and to uploads the caller owns
      const siblings = await tx.item.findMany({
        where: {
          wrappedKey: item.wrappedKey,
          containerId,
          upload: { ownerId },
        },
        select: { id: true, uploadId: true },
      });
      await tx.item.deleteMany({
        where: { id: { in: siblings.map(({ id }) => id) } },
      });

      // An upload is removed only once no item references it any more;
      // other items (e.g. share-only copies) may still point at it.
      const orphaned = await tx.upload.findMany({
        where: {
          id: { in: siblings.map(({ uploadId }) => uploadId) },
          items: { none: {} },
        },
        select: { id: true },
      });
      const uploadIds = orphaned.map(({ id }) => id);
      await tx.upload.deleteMany({ where: { id: { in: uploadIds } } });

      // touch the container's `updatedAt` date
      await tx.container.update({
        where: { id: containerId },
        data: { updatedAt: new Date() },
      });

      return { wrappedKey: item.wrappedKey, uploadIds };
    })
    .catch((error) => {
      if (error instanceof BaseError) {
        throw error;
      }
      console.error('Error deleting items and uploads:', error);
      throw new BaseError(ITEM_NOT_DELETED);
    });

  // Storage is external, so it is only touched once the rows are committed.
  // The rows are the source of truth: a storage failure is logged, not
  // reported, so the client sees the same result as the database.
  if (shouldDeleteUpload) {
    await Promise.all(
      uploadIds.map(async (uploadId) => {
        try {
          await storage.del(uploadId);
        } catch (error) {
          console.error(
            `Error deleting upload ${uploadId} from storage:`,
            error
          );
        }
      })
    );
  }

  console.log(
    `Deleted uploads with IDs: ${uploadIds.join(', ')} and shouldDeleteUpload is ${shouldDeleteUpload}`
  );

  // We only need to return the wrappedKey of the deleted item so that the frontend can remove it from its state
  return { wrappedKey };
}

export async function getContainerInfo(id: string) {
  const query = {
    where: {
      id,
    },
  };
  return await fromPrismaV2(
    prisma.container.findUniqueOrThrow,
    query,
    CONTAINER_NOT_FOUND
  );
}

export async function getUploadsOwnedByUser(id: string) {
  return await prisma.upload.findMany({
    where: {
      ownerId: id,
    },
    select: {
      id: true,
    },
  });
}

export async function deleteUpload(id: string) {
  return await prisma.upload.delete({
    where: {
      id,
    },
  });
}

/**
 * Best-effort cleanup of uploads by id, used when a (multipart) upload fails
 * partway and the client wants to remove any parts it already wrote to storage.
 *
 * Removes the stored bytes (keyed by upload id) and, when present, the DB
 * `Upload` row.
 *
 * Ownership invariant: an id is only acted on when the server can attribute
 * it to the caller — via the `Upload` row's owner when a row exists, or via
 * the ownership tag minted into the id itself (`mintOwnedUploadId`, POST
 * /uploads/signed) for storage-only orphans whose row was never created. Ids
 * the server cannot attribute to the caller — another user's row, another
 * user's tag, or a plain pre-tag id — are skipped, never deleted.
 */
export async function deleteUploadsByIds(ids: string[], requesterId: string) {
  const rows = await prisma.upload.findMany({
    where: { id: { in: ids } },
    select: { id: true, ownerId: true },
  });
  const ownerById = new Map(rows.map(({ id, ownerId }) => [id, ownerId]));

  const deleted: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // Deduplicate so a repeated id isn't processed twice.
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const owner = ownerById.get(id);

      // Row-less id: a storage-only orphan (PUT landed, row never created) or
      // an unknown id. Only the caller the id was minted for may remove the
      // bytes; anything the server cannot attribute to the caller is skipped.
      if (owner === undefined) {
        if (!verifyOwnedUploadId(id, requesterId)) {
          skipped.push(id);
          return;
        }
        // Absent bytes (e.g. a part whose PUT never landed) are fine — the
        // goal is idempotent "make sure it's gone".
        try {
          await storage.del(id);
        } catch (e) {
          console.warn(`[deleteUploadsByIds] storage.del(${id}) failed`, e);
        }
        deleted.push(id);
        return;
      }

      // A row exists but belongs to someone else — refuse to touch it.
      if (owner !== requesterId) {
        skipped.push(id);
        return;
      }

      // Remove bytes first. Absent bytes (e.g. a part whose PUT never landed)
      // are fine — the goal is idempotent "make sure it's gone".
      try {
        await storage.del(id);
      } catch (e) {
        console.warn(`[deleteUploadsByIds] storage.del(${id}) failed`, e);
      }

      try {
        await deleteUpload(id);
      } catch (e) {
        console.error(`[deleteUploadsByIds] deleteUpload(${id}) failed`, e);
        errors.push(id);
        return;
      }

      deleted.push(id);
    })
  );

  // A cleaned-up upload stops reserving quota; the sweep still removes any
  // bytes a late PUT stores under its id.
  try {
    await releasePendingUploads(requesterId, deleted);
  } catch (e) {
    console.error('[deleteUploadsByIds] releasePendingUploads failed', e);
  }

  return { deleted, skipped, errors };
}

export async function getContainersOwnedByUser(id: string) {
  return await prisma.container.findMany({
    where: {
      ownerId: id,
    },
    select: {
      id: true,
      items: true,
    },
  });
}

export async function deleteContainer(id: string) {
  return prisma.container.delete({ where: { id } });
}

export async function getContainerWithDescendants(id: string) {
  const query = {
    where: { id },
    include: {
      children: true,
    },
  };

  const container = await fromPrismaV2(
    prisma.container.findUniqueOrThrow,
    query,
    CONTAINER_NOT_FOUND
  );

  if (container.children.length > 0) {
    for (let i = 0; i < container.children.length; i++) {
      const children = await getContainerWithDescendants(
        container.children[i].id
      );
      container.children[i] = children;
    }
  }

  return container;
}

export const createLoginSession = async (id: string) =>
  fromPrismaV3(
    prisma.login.create,
    { data: { fxasession: id } },
    SESSION_NOT_CREATED
  );

export const getLoginSession = async (id: string) =>
  fromPrismaV2(
    prisma.login.findUniqueOrThrow,
    {
      where: {
        fxasession: id,
      },
    },
    SESSION_NOT_FOUND
  );

export const deleteSession = async (id: string) =>
  fromPrismaV3(
    prisma.login.delete,
    {
      where: { fxasession: id },
    },
    SESSION_NOT_DELETED
  );

// An orphan is an Upload with no Item, older than `hoursSinceCreation` so an
// in-flight upload (items are created after every part is stored) is never
// matched (#117). Rows without a createdAt predate it being set and count as old.
function findOrphanRows(hoursSinceCreation: number, take = CLEANUP_BATCH_SIZE) {
  return prisma.upload.findMany({
    where: {
      items: { none: {} },
      OR: [
        { createdAt: { lt: hoursAgo(hoursSinceCreation) } },
        { createdAt: null },
      ],
    },
    select: { id: true, ownerId: true },
    take,
  });
}

export async function findOrphans(
  hoursSinceCreation = getOrphanMinAgeHours()
): Promise<{ uploadIds: string[] }> {
  const rows = await findOrphanRows(hoursSinceCreation);
  return { uploadIds: rows.map(({ id }) => id) };
}

type OrphanOutcome = 'deleted' | 'kept' | 'error';

// Thrown to roll back an orphan delete whose reservation a finalize holds.
class OrphanHeld extends Error {}

async function deleteOrphan({
  id,
  ownerId,
}: {
  id: string;
  ownerId: string;
}): Promise<OrphanOutcome> {
  try {
    // The row goes together with a claimed sweep record for its bytes, so they
    // stay reachable if the delete below fails and a replayed finalize is
    // refused. A leftover reservation is claimed rather than skipped; one a
    // finalize holds (unexpired) rolls the delete back.
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.upload.deleteMany({
        where: { id, items: { none: {} } },
      });
      if (count === 0) return false;
      if (!(await claimBytes(tx, id, ownerId))) throw new OrphanHeld();
      return true;
    });
    if (!claimed) return 'kept';
  } catch (e) {
    if (e instanceof OrphanHeld) return 'kept';
    console.warn(`[deleteOrphans] Could not delete upload ${id}`, e);
    return 'error';
  }

  try {
    await storage.del(id);
    await clearPendingUploads(ownerId, [id]);
  } catch (e) {
    // The sweep record stays; the next sweep retries.
    console.warn(`[deleteOrphans] storage cleanup of ${id} failed`, e);
  }
  return 'deleted';
}

/**
 * Deletes up to `limit` orphaned Upload rows and their stored bytes. A dry run
 * only reports them.
 */
export async function deleteOrphans(
  hoursSinceCreation = getOrphanMinAgeHours(),
  { limit = CLEANUP_BATCH_SIZE, dryRun = false }: CleanupOptions = {}
) {
  const take = Math.min(limit, CLEANUP_BATCH_SIZE);
  const rows = take > 0 ? await findOrphanRows(hoursSinceCreation, take) : [];
  if (dryRun) {
    logDryRun('orphaned uploads', rows);
    return { found: rows.length, deletedUploadIds: [], errorUploadIds: [] };
  }
  const outcomes = await mapLimit(rows, CLEANUP_CONCURRENCY, deleteOrphan);
  const idsWith = (outcome: OrphanOutcome) =>
    rows.filter((_, i) => outcomes[i] === outcome).map(({ id }) => id);
  return {
    found: rows.length,
    deletedUploadIds: idsWith('deleted'),
    errorUploadIds: idsWith('error'),
  };
}

const getUploadSizesForUser = async (userId: string) => {
  const result = await prisma.upload.aggregate({
    where: { ownerId: userId },
    _sum: { size: true },
  });
  return Number(result._sum.size ?? 0);
};

// `active` includes bytes reserved by unfinished presigned uploads, so
// repeatedly requesting URLs without finalizing cannot exceed the limit.
// `finalizingId` is the upload being finalized; its reservation is not counted.
export const getUsedStorage = async (
  userId: string,
  hasLimitedStorage = false,
  finalizingId?: string
) => {
  const reserved = await getReservedBytes(userId, finalizingId);
  if (!hasLimitedStorage) {
    const uploads = await getUploadSizesForUser(userId);
    return { active: uploads + reserved, expired: 0 };
  }

  const folders = await getAllUserGroupContainers(userId, ContainerType.FOLDER);

  // If the user has a limited storage, we need to calculate the total size of the active uploads and the expired uploads
  if (hasLimitedStorage) {
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
    return {
      active: active + reserved,
      expired,
    };
  }
  // This won't run, we'll keep in case we go back to calculating storage without the hasLimitedStorage flag, but for now we calculate storage based on the flag and ignore expiry
  const active = folders
    // Make a sum of all the sizes that haven't expired
    .flatMap((folder) => folder.items.map((item) => item.upload.size))
    .reduce((sizeA, sizeB) => sizeA + Number(sizeB), 0);

  return {
    active,
    expired: 0,
  };
};
