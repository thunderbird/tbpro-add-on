import { ContainerType, PrismaClient, User, UserTier } from '@prisma/client';
import {
  PROFILE_NOT_CREATED,
  USER_NOT_CREATED,
  USER_NOT_FOUND,
  USER_NOT_UPDATED,
} from '../errors/models';
import { CacheKeys, cacheService } from '../services/cache';
import { fromPrisma, fromPrismaV2, itemsIncludeOptions } from './prisma-helper';
const prisma = new PrismaClient();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const CACHE_TTL_MS = FIFTEEN_MINUTES;

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

export async function getUserById(id: string) {
  // Check cache first
  const cacheKey = CacheKeys.userById(id);
  const cachedUser = await cacheService.get(cacheKey);

  if (cachedUser) {
    return cachedUser;
  }

  // Fetch from database
  const user = await prisma.user.findUnique({ where: { id } });

  // Cache the result (including null results to prevent repeated DB calls)
  if (user) {
    await cacheService.set(cacheKey, user, CACHE_TTL_MS);
  } else {
    // Cache null results for a shorter time to prevent repeated DB calls for non-existent users
    await cacheService.set(cacheKey, null, CACHE_TTL_MS / 3); // 5 minutes for null results
  }

  return user;
}

export async function resetKeys(id: string) {
  const result = await prisma.user.update({
    data: {
      publicKey: null,
      backupKeypair: null,
      backupContainerKeys: null,
      backupKeystring: null,
      backupSalt: null,
    },
    where: {
      id,
    },
  });

  // Clear related caches
  await clearBackupCache(id);
  await cacheService.del(CacheKeys.userPublicKey(id));
  await cacheService.del(CacheKeys.userById(id));

  return result;
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

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  userResponse = userFromProfile || userFromEmail;

  // If a user hasn't been created via OIDC or previousliy by fxa, we create one
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

export async function getRecentActivity(
  userId: string,
  type: ContainerType | null
) {
  // Get all containers
  const containerWhere = await _whereContainer(userId, type);
  const query = {
    take: 10,
    where: containerWhere,
    orderBy: [
      {
        updatedAt: 'desc',
      },
      {
        name: 'asc',
      },
    ],
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      type: true,
      shareOnly: true,
      items: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await fromPrisma(prisma.container.findMany as any, query);
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

// Cached backup functions that can easily be replaced with Redis

/**
 * Get user backup data with caching
 * Checks cache first, falls back to database if not found
 */
export async function getBackupCached(id: string) {
  const cacheKey = CacheKeys.userBackup(id);

  // Try to get from cache first
  const cachedBackup = await cacheService.get(cacheKey);
  if (cachedBackup) {
    // return cachedBackup;
  }

  // If not in cache, get from database
  const backup = await getBackup(id);

  console.log('comparing cache vs db backup', {
    cachedBackup: JSON.stringify(cachedBackup).length,
    backup: JSON.stringify(backup).length,
  });

  // Cache the result for 15 minutes
  if (backup) {
    await cacheService.set(cacheKey, backup, CACHE_TTL_MS);
  }

  return backup;
}

/**
 * Set user backup data and update cache
 * Updates database and invalidates/updates cache
 */
export async function setBackupCached(
  id: string,
  keys: string,
  keypair: string,
  keystring: string,
  salt: string
) {
  const cacheKey = CacheKeys.userBackup(id);

  // Update database
  const result = await setBackup(id, keys, keypair, keystring, salt);

  // Update cache with new data
  const newBackupData = {
    backupContainerKeys: keys,
    backupKeypair: keypair,
    backupKeystring: keystring,
    backupSalt: salt,
  };

  await cacheService.set(cacheKey, newBackupData, CACHE_TTL_MS);

  return result;
}

/**
 * Clear backup cache for a user
 * Useful when backup is deleted or user data is reset
 */
export async function clearBackupCache(id: string) {
  const cacheKey = CacheKeys.userBackup(id);
  await cacheService.del(cacheKey);
}

// OIDC Authentication Functions

export async function getUserByOIDCSubject(oidcSubject: string) {
  // Check cache first
  const cacheKey = CacheKeys.userByOIDCSubject(oidcSubject);
  const cachedUser = await cacheService.get(cacheKey);

  if (cachedUser) {
    return cachedUser;
  }

  // Fetch from database
  const user = await prisma.user.findUnique({
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
    },
  });

  // Cache the result (including null results to prevent repeated DB calls)
  if (user) {
    await cacheService.set(cacheKey, user, CACHE_TTL_MS);
  } else {
    // Cache null results for a shorter time to prevent repeated DB calls for non-existent users
    await cacheService.set(cacheKey, null, CACHE_TTL_MS / 3); // 5 minutes for null results
  }

  return user;
}

export async function findOrCreateUserByOIDC({
  oidcSubject,
  email,
}: {
  oidcSubject: string;
  email: string;
}) {
  // First try to find existing user by OIDC subject
  let user = await getUserByOIDCSubject(oidcSubject);

  if (user) {
    // Update user info if email has changed
    if (user.email !== email) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { email },
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
    return user;
  }

  // Try to find by email and update with OIDC subject if exists
  const existingUser = await getUserByEmailV2(email);
  if (existingUser && !existingUser.oidcSubject) {
    return await prisma.user.update({
      where: { id: existingUser.id },
      data: { oidcSubject },
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

  // Create new user
  const newUser = await prisma.user.create({
    data: {
      email,
      oidcSubject,
      tier: UserTier.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
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

  return newUser;
}
