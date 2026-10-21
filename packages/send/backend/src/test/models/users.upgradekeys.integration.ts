import {
  ContainerType,
  ItemType,
  PrismaClient,
  User,
  UserTier,
} from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBackup, upgradeKeys } from '../../models/users';

// Key backup v2 against a real database: the transaction rolls back as a whole
// when one item is stale or belongs to someone else, link revocation is scoped
// to the caller's containers, and legacy writes no longer match a v2 row.

const prisma = new PrismaClient();
const LEGACY = {
  backupKeypair: 'kp',
  backupContainerKeys: 'ck',
  backupKeystring: 'ks',
  backupSalt: 'salt',
};

async function makeUser(email: string) {
  return prisma.user.create({
    data: {
      publicKey: 'old-pk',
      email,
      tier: UserTier.PRO,
      ...LEGACY,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

async function makeFolderWithItemAndLink(owner: User, wrappedKey: string) {
  const group = await prisma.group.create({ data: {} });
  const container = await prisma.container.create({
    data: {
      name: 'folder',
      ownerId: owner.id,
      groupId: group.id,
      type: ContainerType.FOLDER,
    },
  });
  const upload = await prisma.upload.create({
    data: { size: 1, ownerId: owner.id, type: 'application/octet-stream' },
  });
  const item = await prisma.item.create({
    data: {
      name: 'file',
      wrappedKey,
      containerId: container.id,
      uploadId: upload.id,
      type: ItemType.FILE,
    },
  });
  const share = await prisma.share.create({
    data: { containerId: container.id, senderId: owner.id },
  });
  await prisma.accessLink.create({
    data: {
      id: `link-${item.id}`,
      shareId: share.id,
      wrappedKey: 'wk',
      salt: 's',
      challengeKey: 'k',
      challengeSalt: 's',
      challengeCiphertext: 'c',
      challengePlaintext: 'p',
    },
  });
  return { group, container, upload, item };
}

describe('upgradeKeys (database)', () => {
  let alice: User;
  let bob: User;
  let aliceFolder: Awaited<ReturnType<typeof makeFolderWithItemAndLink>>;
  let bobFolder: Awaited<ReturnType<typeof makeFolderWithItemAndLink>>;

  beforeEach(async () => {
    const tag = Date.now();
    alice = await makeUser(`alice-${tag}@example.com`);
    bob = await makeUser(`bob-${tag}@example.com`);
    aliceFolder = await makeFolderWithItemAndLink(alice, 'alice-old');
    bobFolder = await makeFolderWithItemAndLink(bob, 'bob-old');
  });

  afterEach(async () => {
    for (const f of [aliceFolder, bobFolder]) {
      await prisma.group.delete({ where: { id: f.group.id } });
      await prisma.upload.delete({ where: { id: f.upload.id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
  });

  const base = { publicKey: 'new-pk', backup: '{"v":2}' };

  it('upgrades v1 -> v2, re-wraps owned items and revokes only own links', async () => {
    const result = await upgradeKeys(alice.id, {
      ...base,
      items: [
        {
          id: aliceFolder.item.id,
          wrappedKey: 'alice-new',
          expectedWrappedKey: 'alice-old',
        },
      ],
      revokeLinks: true,
    });

    expect(result).toEqual({ from: 1, items: 1, linksRevoked: 1 });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
    });
    expect(user).toMatchObject({
      publicKey: 'new-pk',
      backup: '{"v":2}',
      backupVersion: 2,
      backupKeypair: null,
      backupContainerKeys: null,
      backupKeystring: null,
      backupSalt: null,
    });
    const item = await prisma.item.findUniqueOrThrow({
      where: { id: aliceFolder.item.id },
    });
    expect(item.wrappedKey).toBe('alice-new');
    expect(
      await prisma.accessLink.count({
        where: { id: `link-${bobFolder.item.id}` },
      })
    ).toBe(1);
  });

  it.each([
    ['a stale expectedWrappedKey', 'self'],
    ["an item in another user's container", 'other'],
  ])('rolls everything back on %s', async (_, whose) => {
    const foreign = whose === 'other';
    await expect(
      upgradeKeys(alice.id, {
        ...base,
        items: [
          {
            id: aliceFolder.item.id,
            wrappedKey: 'alice-new',
            expectedWrappedKey: 'alice-old',
          },
          {
            id: foreign ? bobFolder.item.id : aliceFolder.item.id,
            wrappedKey: 'x',
            expectedWrappedKey: foreign ? 'bob-old' : 'not-current',
          },
        ],
        revokeLinks: true,
      })
    ).rejects.toThrow('KEY_UPGRADE_STALE');

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
    });
    expect(user).toMatchObject({
      publicKey: 'old-pk',
      backup: null,
      backupVersion: 1,
      ...LEGACY,
    });
    const items = await prisma.item.findMany({
      where: { id: { in: [aliceFolder.item.id, bobFolder.item.id] } },
      orderBy: { id: 'asc' },
    });
    expect(items.map((i) => i.wrappedKey)).toEqual(['alice-old', 'bob-old']);
    expect(
      await prisma.accessLink.count({
        where: { id: `link-${aliceFolder.item.id}` },
      })
    ).toBe(1);
  });

  it('refuses a legacy write after the upgrade', async () => {
    await upgradeKeys(alice.id, base);

    await expect(setBackup(alice.id, 'a', 'b', 'c', 'd')).rejects.toThrow();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
    });
    expect(user.backupKeypair).toBeNull();
    expect(user.backupVersion).toBe(2);
  });
});
