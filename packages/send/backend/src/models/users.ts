import { ContainerType, PrismaClient, User, UserTier } from '@prisma/client';
import {
  PROFILE_NOT_CREATED,
  USER_NOT_CREATED,
  USER_NOT_FOUND,
  USER_NOT_UPDATED,
} from '../errors/models';
import storage from '../storage';
import { mapLimit } from '../utils/mapLimit';
import { CLEANUP_CONCURRENCY } from './pendingUploads';
import { fromPrismaV2, itemsIncludeOptions } from './prisma-helper';
const prisma = new PrismaClient();

export async function createUser(
  publicKey: string,
  email: string,
  tier: UserTier = UserTier.PRO
) {
  return prisma.user.create({
    data: {
      publicKey,
      email,
      tier,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

// Profile fields only (frontend `UserType`): callers send this row to the
// client, so credentials and key-backup columns must never be selected (#1340).
const USER_PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  thundermailEmail: true,
  tier: true,
  createdAt: true,
  updatedAt: true,
  uniqueHash: true,
} as const;

export async function getUserById(id: string) {
  return await prisma.user.findUnique({
    where: { id },
    select: USER_PROFILE_SELECT,
  });
}

/**
 * The confirmed replacement key material required to safely reset access.
 *
 * Issue #1116: the old reset nulled `publicKey`/`backupKeypair`/`backupKeystring`
 * /`backupSalt`/`backupContainerKeys` BEFORE any replacement existed. If setup
 * did not complete immediately afterwards, the account was left with no recovery
 * blob at all — a permanent, unrecoverable lockout. To make reset safe we never
 * destroy the recovery blob until a replacement is in hand, then swap it in a
 * single atomic update ("write-new-then-swap"), instead of a destructive wipe.
 */
export type ResetKeysReplacement = {
  publicKey?: string;
  backupKeypair?: string;
  backupKeystring?: string;
  backupSalt?: string;
  // A fresh reset starts with no container keys; callers may still send the
  // (empty) serialized map their client produced.
  backupContainerKeys?: string;
};

/**
 * Reset a user's encryption keys by swapping in a fresh, already-persisted
 * replacement blob.
 *
 * This is intentionally fail-closed: without a `replacement` we refuse to touch
 * the row rather than nulling the only recovery material (see #1116). The swap
 * is a single `update`, so the old blob is never observable-as-gone before the
 * new one lands, and `updatedAt` is bumped so the change is visible to anything
 * auditing on it (the old wipe left `updatedAt` unchanged).
 */
export async function resetKeys(
  id: string,
  replacement?: ResetKeysReplacement
) {
  if (
    !replacement ||
    !replacement.publicKey ||
    !replacement.backupKeypair ||
    !replacement.backupKeystring ||
    !replacement.backupSalt
  ) {
    // Refuse to destroy the recovery blob without a confirmed replacement.
    throw new Error(USER_NOT_UPDATED);
  }

  return await prisma.user.update({
    data: {
      publicKey: replacement.publicKey,
      backupKeypair: replacement.backupKeypair,
      backupKeystring: replacement.backupKeystring,
      backupSalt: replacement.backupSalt,
      backupContainerKeys: replacement.backupContainerKeys ?? null,
      updatedAt: new Date(),
    },
    where: {
      id,
    },
  });
}

export async function getUserByEmail(email: string) {
  // TODO: revisit this and consider deleting
  const query = {
    where: {
      email,
    },
  };

  const users = await fromPrismaV2(
    prisma.user.findMany,
    query,
    USER_NOT_CREATED
  );

  if (!users?.length || !users) {
    return null;
  }

  return users[0];
}

export async function getUserByProfile(mozid: string) {
  const userQuery = {
    where: {
      profile: {
        mozid,
      },
    },
  };

  return await fromPrismaV2(prisma.user.findFirst, userQuery);
}

export async function getUserByEmailV2(email: string) {
  return prisma.user.findFirst({
    where: {
      email,
    },
    select: {
      id: true,
      email: true,
      tier: true,
      createdAt: true,
      updatedAt: true,
      activatedAt: true,
      oidcSubject: true,
    },
  });
}

export async function getHashedPassword(email: string) {
  return prisma.user.findFirst({
    where: {
      email,
    },
    select: {
      hashedPassword: true,
      id: true,
    },
  });
}

export async function createUserWithPassword(email: string, password: string) {
  return prisma.user.create({
    data: {
      email,
      tier: UserTier.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
      hashedPassword: password,
    },
    select: {
      id: true,
    },
  });
}

// Given a Mozilla account id, find or create a Profile and linked User
export async function findOrCreateUserProfileByMozillaId(
  mozid: string,
  avatar?: string,
  email?: string,
  accessToken?: string,
  refreshToken?: string
) {
  let userResponse: User;

  const userFromProfile = await getUserByProfile(mozid);
  const userFromEmail = await getUserByEmailV2(email);

  // @ts-expect-error
  userResponse = userFromProfile || userFromEmail;

  // If a user hasn't been created via OIDC, we create one
  if (!userFromProfile?.id && !userFromEmail) {
    userResponse = await createUser('', email, UserTier.FREE);
  }

  const profile = await fromPrismaV2(
    prisma.profile.upsert,
    {
      where: {
        mozid,
      },
      update: {
        avatar,
        accessToken,
        refreshToken,
      },
      create: {
        mozid,
        avatar,
        accessToken,
        refreshToken,
        user: {
          connect: {
            id: userResponse.id,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            tier: true,
            createdAt: true,
            updatedAt: true,
            activatedAt: true,
          },
        },
      },
    },
    PROFILE_NOT_CREATED
  );

  // If the user exists, update the profile connection
  if (userFromEmail && userFromEmail?.oidcSubject) {
    return await prisma.user.update({
      where: { id: userFromEmail.id },
      data: {
        profile: {
          connect: profile,
        },
      },
      select: {
        id: true,
        email: true,
        uniqueHash: true,
        tier: true,
        oidcSubject: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // Flip the nesting of the user and the profile.
  delete profile.user;
  userResponse['profile'] = profile;

  return userResponse;
}

export async function getUserPublicKey(id: string) {
  const query = {
    where: {
      id,
    },
    select: {
      publicKey: true,
    },
  };

  return await fromPrismaV2(
    prisma.user.findUniqueOrThrow,
    query,
    USER_NOT_FOUND
  );
}

export async function updateUserPublicKey(id: string, publicKey: string) {
  const query = {
    where: {
      id,
    },
    data: {
      publicKey,
    },
    // The route returns this row to the client (#1340).
    select: { publicKey: true },
  };

  return await fromPrismaV2(prisma.user.update, query, USER_NOT_UPDATED);
}

export async function updateUniqueHash(id: string, uniqueHash: string) {
  await prisma.user.update({ where: { id }, data: { uniqueHash } });
}

async function _whereContainer(
  userId: string,
  type: ContainerType | null,
  shareOnly?: boolean,
  topLevelOnly?: boolean
) {
  const query = {
    where: {
      id: userId,
    },
    select: {
      id: true,
      groups: {
        select: {
          groupId: true,
        },
      },
    },
  };

  const user = await fromPrismaV2(
    prisma.user.findUniqueOrThrow,
    query,
    USER_NOT_FOUND
  );

  const groupIds = user.groups.map(({ groupId }) => groupId);
  const containerWhere = {
    groupId: {
      in: groupIds,
    },
  };

  if (type) {
    containerWhere['type'] = type;
  }

  if (shareOnly !== undefined) {
    containerWhere['shareOnly'] = shareOnly;
  }

  // top-level containers have a null parentId
  if (topLevelOnly !== undefined) {
    containerWhere['parentId'] = null;
  }

  return containerWhere;
}

// Does not include shareOnly containers.
export async function getAllUserGroupContainers(
  userId: string,
  type: ContainerType | null
) {
  const containerWhere = await _whereContainer(userId, type, false, true);
  const query = {
    where: containerWhere,
    include: {
      ...itemsIncludeOptions,
    },
  };
  return await fromPrismaV2(prisma.container.findMany, query);
}

export async function getBackup(id: string) {
  return await fromPrismaV2(
    prisma.user.findUnique,
    {
      where: {
        id,
      },
      select: {
        backupContainerKeys: true,
        backupKeypair: true,
        backupKeystring: true,
        backupSalt: true,
      },
    },
    USER_NOT_FOUND
  );
}

export async function setBackup(
  id: string,
  keys: string,
  keypair: string,
  keystring: string,
  salt: string
) {
  const query = {
    where: {
      id,
    },
    data: {
      backupContainerKeys: keys,
      backupKeypair: keypair,
      backupKeystring: keystring,
      backupSalt: salt,
    },
  };

  return await fromPrismaV2(prisma.user.update, query, USER_NOT_FOUND);
}

// OIDC Authentication Functions

export async function getUserByOIDCSubject(oidcSubject: string) {
  return prisma.user.findUnique({
    where: {
      oidcSubject,
    },
    select: {
      id: true,
      email: true,
      uniqueHash: true,
      tier: true,
      oidcSubject: true,
      createdAt: true,
      updatedAt: true,
      thundermailEmail: true,
      name: true,
    },
  });
}

export async function findOrCreateUserByOIDC({
  oidcSubject,
  email,
  thundermailEmail,
  name,
}: {
  oidcSubject: string;
  email: string;
  thundermailEmail?: string;
  name?: string;
}) {
  // First try to find existing user by OIDC subject
  const userFromPrisma = await getUserByOIDCSubject(oidcSubject);

  if (userFromPrisma) {
    const thundermailEmailChanged =
      thundermailEmail && thundermailEmail !== userFromPrisma.thundermailEmail;

    if (
      !userFromPrisma.thundermailEmail ||
      !userFromPrisma.name ||
      thundermailEmailChanged
    ) {
      if (!userFromPrisma.name && name) {
        await prisma.user.update({
          where: { id: userFromPrisma.id },
          data: { name },
        });
      }

      // Update entry with thundermailEmail if it's missing or has changed
      if (
        thundermailEmail &&
        (!userFromPrisma.thundermailEmail || thundermailEmailChanged)
      ) {
        await prisma.user.update({
          where: { id: userFromPrisma.id },
          data: { thundermailEmail },
        });
      }

      const updatedUser = await getUserByOIDCSubject(oidcSubject);
      return updatedUser;
    }

    return userFromPrisma;
  }

  // If the user doesn't exist, we create one
  const newUser = await prisma.user.create({
    data: {
      email,
      oidcSubject,
      tier: UserTier.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
      thundermailEmail,
      name,
    },
    select: {
      id: true,
      email: true,
      uniqueHash: true,
      tier: true,
      oidcSubject: true,
      createdAt: true,
      updatedAt: true,
      thundermailEmail: true,
      name: true,
    },
  });

  return newUser;
}

export const markFTUEComplete = async (userId: string) => {
  return prisma.user.update({
    where: { id: userId },
    data: { isFTUEComplete: true },
  });
};

export const getFTUEStatus = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isFTUEComplete: true },
  });

  return user?.isFTUEComplete;
};

export async function getAdminStatus(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { isAdmin: true },
  });

  return user?.isAdmin;
}

export async function getAllUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
    },
  });
}

/**
 * Deletes the user, everything they own, and their stored objects (#1314).
 * Shares they created and items in other users' folders that point at their
 * uploads go too, since both would block the delete. Objects are removed only
 * after the rows commit; a failed delete is left to the orphan sweep.
 */
export async function deleteUser(id: string) {
  const { user, uploadIds } = await prisma.$transaction(async (tx) => {
    const uploads = await tx.upload.findMany({
      where: { ownerId: id },
      select: { id: true },
    });
    await tx.membership.deleteMany({ where: { userId: id } });
    await tx.share.deleteMany({ where: { senderId: id } });
    await tx.item.deleteMany({ where: { upload: { ownerId: id } } });
    // Cascade: items, shares and access links of the user's containers.
    await tx.container.deleteMany({ where: { ownerId: id } });
    await tx.upload.deleteMany({ where: { ownerId: id } });
    // Cascade: profile.
    const user = await tx.user.delete({ where: { id } });
    return { user, uploadIds: uploads.map((upload) => upload.id) };
  });

  await mapLimit(uploadIds, CLEANUP_CONCURRENCY, (uploadId) =>
    storage.del(uploadId).catch((e) => {
      console.warn(`[deleteUser] storage.del(${uploadId}) failed`, e);
      return false;
    })
  );
  return user;
}
