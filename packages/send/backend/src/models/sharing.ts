/* eslint-disable @typescript-eslint/no-unused-vars */
import { Prisma, PrismaClient, Share, UserTier } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { MAX_ACCESS_LINK_RETRIES } from '@send-backend/config';
import {
  ACCESSLINK_NOT_DELETED,
  BaseError,
  ACCESSLINK_NOT_FOUND,
  CONTAINER_NOT_DELETED,
  CONTAINER_NOT_FOUND,
  GROUP_NOT_DELETED,
  ITEM_NOT_DELETED,
  MEMBERSHIP_NOT_DELETED,
  SHARE_NOT_DELETED,
  SHARE_NOT_FOUND,
  UPLOAD_NOT_DELETED,
  USER_NOT_DELETED,
} from '../errors/models';
import storage from '../storage';
import { fromPrismaV2 } from './prisma-helper';
const prisma = new PrismaClient();

const onFindShareError = () => {
  throw new Error(`Could not find existing share for access link`);
};
const onCreateError = () => {
  throw new Error(`Could not create share for access link`);
};

/**
 * Create Access Link
 * Creates an access link for a container.
 * Looks for an existing share (which connects access links to containers).
 * If one is not found, a new share is created.
 * Function will throw an error if unable to create the new share or the access link.
 */
export async function createAccessLink(
  containerId: string,
  senderId: string,
  wrappedKey: string,
  salt: string,
  challengeKey: string,
  challengeSalt: string,
  challengeCiphertext: string,
  challengePlaintext: string,
  permission: number,
  expiration?: string
) {
  let share: Share;

  const findShareQuery = {
    where: {
      containerId,
      senderId,
    },
  };

  const existingShare = await fromPrismaV2(
    prisma.share.findFirst,
    findShareQuery,
    onFindShareError
  );

  if (!existingShare?.id) {
    const createShareQuery = {
      data: {
        containerId,
        senderId,
      },
    };

    share = await fromPrismaV2(
      prisma.share.create,
      createShareQuery,
      onCreateError
    );
  } else {
    share = existingShare;
  }

  const id = uuidv4();
  const expiryDate = expiration ? new Date(expiration) : null;

  const accessLinkQuery = {
    data: {
      id,
      share: {
        connect: {
          id: share.id,
        },
      },
      wrappedKey,
      salt,
      challengeKey,
      challengeSalt,
      challengeCiphertext,
      challengePlaintext,
      permission,
      expiryDate,
    },
  };
  const onAccessLinkError = () => {
    throw new Error(`Could not create access link`);
  };
  return await fromPrismaV2(
    prisma.accessLink.create,
    accessLinkQuery,
    onAccessLinkError
  );
}

// The single rule for whether a link may still release its challenge, key or
// container: not locked and not past its expiry date (#1006, #1010).
export function usableAccessLinkWhere(now = new Date()) {
  return {
    locked: false,
    OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
  } satisfies Prisma.AccessLinkWhereInput;
}

export async function getAccessLinkRetryCount(linkId: string) {
  return await prisma.accessLink.findFirst({
    where: {
      id: linkId,
    },
    select: {
      id: true,
      retryCount: true,
    },
  });
}

export async function getAccessLinkChallenge(linkId: string) {
  const query = {
    where: {
      id: linkId,
      ...usableAccessLinkWhere(),
    },
    select: {
      challengeKey: true,
      challengeSalt: true,
      challengeCiphertext: true,
    },
  };

  return await fromPrismaV2(
    prisma.accessLink.findUniqueOrThrow,
    query,
    ACCESSLINK_NOT_FOUND
  );
}

/**
 * Checks a challenge answer and enforces the retry limit server-side (#1006).
 * Every attempt is counted before it is checked, so concurrent guesses cannot
 * get past MAX_ACCESS_LINK_RETRIES; a correct answer within the limit resets
 * the count, and any refused attempt that reaches the limit locks the link.
 */
export async function acceptAccessLink(
  linkId: string,
  challengePlaintext: unknown
) {
  const query = {
    where: {
      id: linkId,
      ...usableAccessLinkWhere(),
    },
    data: {
      retryCount: { increment: 1 },
    },
    include: {
      share: {
        select: {
          containerId: true,
        },
      },
    },
  };

  const link = await fromPrismaV2(
    prisma.accessLink.update,
    query,
    ACCESSLINK_NOT_FOUND
  );

  const isCorrect =
    typeof challengePlaintext === 'string' &&
    challengePlaintext === link.challengePlaintext;

  if (isCorrect && link.retryCount <= MAX_ACCESS_LINK_RETRIES) {
    await prisma.accessLink.update({
      where: { id: linkId },
      data: { retryCount: 0 },
      select: { id: true },
    });
    return link;
  }

  if (link.retryCount >= MAX_ACCESS_LINK_RETRIES) {
    await prisma.accessLink.update({
      where: { id: linkId },
      data: { locked: true },
      select: { id: true },
    });
  }
  throw new BaseError(ACCESSLINK_NOT_FOUND);
}

export async function getContainerForAccessLink(linkId: string) {
  try {
    const result = await prisma.accessLink.findUniqueOrThrow({
      where: {
        id: linkId,
        ...usableAccessLinkWhere(),
      },
      select: {
        share: {
          select: {
            container: {
              include: {
                owner: {
                  select: {
                    thundermailEmail: true,
                  },
                },
                items: {
                  where: {
                    upload: {
                      isNot: {
                        reported: true,
                      },
                    },
                  },
                  include: {
                    upload: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return result?.share.container;
  } catch (error) {
    throw new Error(ACCESSLINK_NOT_FOUND);
  }
}

export async function isAccessLinkValid(linkId: string) {
  const query = {
    where: {
      id: linkId,
      ...usableAccessLinkWhere(),
    },
    select: {
      id: true,
    },
  };
  const results = await fromPrismaV2(prisma.accessLink.findMany, query);
  return results.length > 0 ? results[0] : null;
}

export async function removeAccessLink(linkId: string) {
  const query = {
    where: {
      id: linkId,
    },
    select: {
      id: true,
    },
  };

  return await fromPrismaV2(
    prisma.accessLink.delete,
    query,
    ACCESSLINK_NOT_DELETED
  );
}

// Owner-facing list queries return link metadata only. The server never holds
// the material needed to rebuild a shareable URL: for links created without a
// password the secret lives solely in the URL fragment the client showed at
// creation time.
const accessLinkListSelect = {
  id: true,
  expiryDate: true,
  locked: true,
  hasPassword: true,
} as const;

export async function getAccessLinksByUploadId(
  uploadId: string,
  ownerId: string
) {
  const links = await prisma.accessLink.findMany({
    select: accessLinkListSelect,
    where: {
      share: {
        container: {
          // Only the owner of the container may list its access links; the
          // query itself is scoped to the caller so an unowned upload id
          // returns nothing rather than acting as an existence oracle.
          ownerId,
          shareOnly: true,
          items: {
            // This is a cheat - instead of searching for containers that only
            // have a single Item with a matching uploadId,
            // we're looking for the containers whose items *all* match uploadId.
            every: {
              uploadId,
            },
          },
          NOT: {
            items: {
              none: {},
            },
          },
        },
      },
    },
  });
  return links;
}

export async function getAccessLinksByUploadIdAndWrappedKey(
  uploadId: string,
  ownerId: string
) {
  const links = await prisma.accessLink.findMany({
    select: accessLinkListSelect,
    where: {
      share: {
        container: {
          // Only the owner of the container may list its access links; the
          // query itself is scoped to the caller so an unowned upload id
          // returns nothing rather than acting as an existence oracle.
          ownerId,
          shareOnly: true,
          items: {
            // This is a cheat - instead of searching for containers that only
            // have a single Item with a matching uploadId,
            // we're looking for the containers whose items *all* match uploadId.
            some: {
              uploadId,
            },
          },
          NOT: {
            items: {
              none: {},
            },
          },
        },
      },
    },
  });
  return links;
}

export async function burnFolder(
  containerId: string,
  shouldDeleteUpload?: boolean
) {
  // delete the ephemeral link
  const findShareQuery = {
    where: {
      containerId,
    },
  };

  const shares = await fromPrismaV2(
    prisma.share.findMany,
    findShareQuery,
    SHARE_NOT_FOUND
  );

  // For each share, delete corresponding access links
  for (const share of shares) {
    const deleteSharesQuery = {
      where: {
        shareId: share.id,
      },
    };

    await fromPrismaV2(
      prisma.accessLink.deleteMany,
      deleteSharesQuery,
      SHARE_NOT_DELETED
    );
  }

  // get the container so we can get the
  // - groups (so we can get users)
  // - items (so we can get uploads)
  const findContainersQuery = {
    where: {
      id: containerId,
    },
    select: {
      group: {
        select: {
          id: true,
          members: {
            select: {
              user: {
                select: {
                  id: true,
                  tier: true,
                },
              },
            },
          },
        },
      },
      items: {
        select: {
          id: true,
          uploadId: true,
        },
      },
    },
  };

  const container = await fromPrismaV2(
    prisma.container.findUniqueOrThrow,
    findContainersQuery,
    CONTAINER_NOT_FOUND
  );

  const users = container.group.members.map(({ user }) => user);

  const uploadIds = container.items.map((item) => item.uploadId);

  await Promise.all(
    container.items.map(async ({ id }) => {
      const deleteItemQuery = {
        where: {
          id,
        },
      };

      return fromPrismaV2(
        prisma.item.delete,
        deleteItemQuery,
        ITEM_NOT_DELETED
      );
    })
  );

  if (shouldDeleteUpload) {
    const deleteFilePromises = (uploadIds as string[]).map((id) =>
      storage.del(id)
    );
    await Promise.all(deleteFilePromises);

    await Promise.all(
      uploadIds.map(async (id) => {
        const deleteUploadQuery = {
          where: {
            id,
          },
        };

        return fromPrismaV2(
          prisma.upload.delete,
          deleteUploadQuery,
          UPLOAD_NOT_DELETED
        );
      })
    );
  }

  const deleteContainerQuery = {
    where: {
      id: containerId,
    },
  };

  await fromPrismaV2(
    prisma.container.delete,
    deleteContainerQuery,
    CONTAINER_NOT_DELETED
  );

  await Promise.all(
    users.map(async (/* { id, tier } */) => {
      const deleteMembershipQuery = {
        where: {
          groupId: container.group.id,
          // don't specify the user id
          // remove all groupUser records for this group
          // userId: id,
        },
      };

      return fromPrismaV2(
        prisma.membership.deleteMany,
        deleteMembershipQuery,
        MEMBERSHIP_NOT_DELETED
      );
    })
  );

  // must do *after* deleting groupUser
  await Promise.all(
    users
      .filter((user) => user.tier === UserTier.EPHEMERAL)
      .map(async ({ id /* , tier */ }) => {
        const userDeleteQuery = {
          where: {
            id,
          },
        };

        await fromPrismaV2(
          prisma.user.delete,
          userDeleteQuery,
          USER_NOT_DELETED
        );
      })
  );

  const groupDeleteQuery = {
    where: {
      id: container.group.id,
    },
  };

  await fromPrismaV2(prisma.group.delete, groupDeleteQuery, GROUP_NOT_DELETED);

  // Basically, if we got this far, everything was burned successfully.
  return {
    message: 'successfully burned folder',
  };
}

// Only matches when `ownerId` owns the link's container, so non-owners get a
// not-found error and the link is left untouched.
export async function deleteAccessLink(linkId: string, ownerId: string) {
  return await prisma.accessLink.delete({
    where: {
      id: linkId,
      share: { container: { ownerId } },
    },
    select: {
      id: true,
    },
  });
}

export async function burnEphemeralConversation(containerId: string) {
  return await burnFolder(containerId);
}

export async function checkIfAccessLinkCanBeCreated(containerId: string) {
  const reportedUploads = await prisma.container.findUnique({
    where: { id: containerId },
    select: {
      items: {
        where: {
          upload: {
            is: {
              reported: true,
            },
          },
        },
      },
    },
  });
  return reportedUploads?.items.length === 0;
}
