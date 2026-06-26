import { ContainerType, PrismaClient } from '@prisma/client';
import {
  BaseError,
  CONTAINER_NOT_CREATED,
  CONTAINER_NOT_FOUND,
  CONTAINER_NOT_UPDATED,
  GROUP_NOT_CREATED,
  MEMBERSHIP_NOT_CREATED,
} from '../errors/models';
import { PermissionType } from '../types/custom';
import {
  childrenIncludeOptions,
  fromPrismaV2,
  itemsIncludeOptions,
} from './prisma-helper';
const prisma = new PrismaClient();

// Automatically creates a group for container
// owner is added to new group
export async function createContainer(
  name: string,
  ownerId: string,
  type: ContainerType,
  parentId: string | null,
  shareOnly: boolean
) {
  // Create the group, the owner's membership, and the container atomically.
  // Doing these as separate calls left a window where a partially-created
  // container (e.g. group without membership) could be observed, surfacing as
  // a spurious 403 / "No Group found". See issue #930.
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.create({ data: {} }).catch((err) => {
      console.error(err);
      throw new BaseError(GROUP_NOT_CREATED);
    });

    await tx.membership
      .create({
        data: {
          groupId: group.id,
          userId: ownerId,
          permission: PermissionType.ADMIN, // Owner has full permissions
        },
      })
      .catch((err) => {
        console.error(err);
        throw new BaseError(MEMBERSHIP_NOT_CREATED);
      });

    return tx.container
      .create({
        data: {
          name,
          ownerId,
          groupId: group.id,
          type,
          shareOnly,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(parentId ? { parentId } : {}),
        },
      })
      .catch((err) => {
        console.error(err);
        throw new BaseError(CONTAINER_NOT_CREATED);
      });
  });
}

export async function getItemsInContainer(id: string) {
  // Nested include syntax
  // per https://github.com/prisma/prisma/discussions/5810#discussioncomment-400341

  const query = {
    where: {
      id,
    },
    include: {
      ...childrenIncludeOptions,
      ...itemsIncludeOptions,
    },
  };

  return fromPrismaV2(
    prisma.container.findUniqueOrThrow,
    query,
    CONTAINER_NOT_FOUND
  );
}

export async function getContainerWithAncestors(id: string) {
  const query = {
    where: {
      id,
    },
  };

  const container = await fromPrismaV2(
    prisma.container.findUniqueOrThrow,
    query,
    CONTAINER_NOT_FOUND
  );

  if (container.parentId) {
    container['parent'] = await getContainerWithAncestors(container.parentId);
  }
  return container;
}

export async function getContainerWithoutAncestors(userId: string) {
  const topLevelContainers = prisma.container.findMany({
    where: {
      parent: { is: null },
      owner: { id: userId },
    },
  });
  return topLevelContainers;
}

export async function setContainerAsDefault(
  container: string,
  ownerId: string
) {
  return await prisma.container.update({
    where: {
      id: container,
      ownerId,
    },
    data: {
      isDefault: true,
      updatedAt: new Date(),
    },
  });
}

export async function getDefaultContainerForOwner(ownerId: string) {
  return await prisma.container.findFirst({
    where: {
      ownerId,
      isDefault: true,
    },
  });
}

export async function getAccessLinksForContainer(containerId: string) {
  const shares = await fromPrismaV2(prisma.share.findMany, {
    where: {
      containerId,
    },
    select: {
      accessLinks: {
        select: {
          id: true,
          expiryDate: true,
          passwordHash: true,
          locked: true,
        },
      },
    },
  });
  return shares.flatMap((share) =>
    share.accessLinks.map((link) => {
      // If there password hash is present, we add it to the id so that the full shareable link can be shown to the user
      return link.passwordHash
        ? { ...link, id: link.id + `#${link.passwordHash}` }
        : link;
    })
  );
}

export async function updateContainerName(containerId: string, name: string) {
  const query = {
    where: {
      id: containerId,
    },
    data: {
      name,
      updatedAt: new Date(),
    },
  };

  return await fromPrismaV2(
    prisma.container.update,
    query,
    CONTAINER_NOT_UPDATED
  );
}
