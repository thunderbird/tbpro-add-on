import {
  ContainerType,
  ItemType,
  PrismaClient,
  User,
  UserTier,
} from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetKeys, setBackup, upgradeKeys } from '../../models/users';

// Key backup v2 against a real database: the transaction rolls back as a whole
// when the public key or an item changed since the client read it or an owned
// item is missing from a rotation, link
// revocation is scoped to the caller's containers, and legacy writes no longer
// match a v2 row.

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

async function addItem(
  ownerId: string,
  containerId: string,
  wrappedKey: string
) {
  const upload = await prisma.upload.create({
    data: { size: 1, ownerId, type: 'application/octet-stream' },
  });
  const item = await prisma.item.create({
    data: {
      name: 'file',
      wrappedKey,
      containerId,
      uploadId: upload.id,
      type: ItemType.FILE,
    },
  });
  return { upload, item };
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
  const { upload, item } = await addItem(owner.id, container.id, wrappedKey);
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
  let extraUploads: string[];

  beforeEach(async () => {
    vi.stubEnv('KEY_BACKUP_V2_MODE', 'optin');
    const tag = Date.now();
    alice = await makeUser(`alice-${tag}@example.com`);
    bob = await makeUser(`bob-${tag}@example.com`);
    aliceFolder = await makeFolderWithItemAndLink(alice, 'alice-old');
    bobFolder = await makeFolderWithItemAndLink(bob, 'bob-old');
    extraUploads = [];
  });

  async function addAliceItem(wrappedKey: string) {
    const { upload, item } = await addItem(
      alice.id,
      aliceFolder.container.id,
      wrappedKey
    );
    extraUploads.push(upload.id);
    return item;
  }

  async function expectAliceUntouched(wrappedKeys: Record<number, string>) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
    });
    expect(user).toMatchObject({
      publicKey: 'old-pk',
      backup: null,
      backupVersion: 1,
      ...LEGACY,
    });
    for (const [id, wrappedKey] of Object.entries(wrappedKeys)) {
      const item = await prisma.item.findUniqueOrThrow({
        where: { id: Number(id) },
      });
      expect(item.wrappedKey).toBe(wrappedKey);
    }
    expect(
      await prisma.accessLink.count({
        where: { id: `link-${aliceFolder.item.id}` },
      })
    ).toBe(1);
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const f of [aliceFolder, bobFolder]) {
      await prisma.group.delete({ where: { id: f.group.id } });
      await prisma.upload.delete({ where: { id: f.upload.id } });
    }
    await prisma.upload.deleteMany({ where: { id: { in: extraUploads } } });
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
  });

  const base = {
    publicKey: 'new-pk',
    expectedPublicKey: 'old-pk',
    backup: '{"v":2}',
  };

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
    ['an item in a container the user is only a member of', 'other'],
  ])('rolls everything back on %s', async (_, whose) => {
    const foreign = whose === 'other';
    const second = await addAliceItem('alice-second');
    if (foreign) {
      await prisma.membership.create({
        data: { groupId: bobFolder.group.id, userId: alice.id },
      });
    }
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
            id: foreign ? bobFolder.item.id : second.id,
            wrappedKey: 'x',
            expectedWrappedKey: foreign ? 'bob-old' : 'not-current',
          },
        ],
        revokeLinks: true,
      })
    ).rejects.toThrow('KEY_UPGRADE_STALE');

    await expectAliceUntouched({
      [aliceFolder.item.id]: 'alice-old',
      [second.id]: 'alice-second',
      [bobFolder.item.id]: 'bob-old',
    });
  });

  it('refuses a rotation that misses an item added after the client read', async () => {
    const added = await addAliceItem('added-meanwhile');

    await expect(
      upgradeKeys(alice.id, {
        ...base,
        items: [
          {
            id: aliceFolder.item.id,
            wrappedKey: 'alice-new',
            expectedWrappedKey: 'alice-old',
          },
        ],
        revokeLinks: true,
      })
    ).rejects.toThrow('KEY_UPGRADE_STALE');

    await expectAliceUntouched({
      [aliceFolder.item.id]: 'alice-old',
      [added.id]: 'added-meanwhile',
    });
  });

  it('lets exactly one of two concurrent upgrades win', async () => {
    const results = await Promise.allSettled(
      ['pk-a', 'pk-b'].map((publicKey) =>
        upgradeKeys(alice.id, {
          ...base,
          publicKey,
          backup: `{"v":2,"from":"${publicKey}"}`,
        })
      )
    );

    const won = results.findIndex((r) => r.status === 'fulfilled');
    const lost = results.find((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((lost as PromiseRejectedResult).reason.message).toBe(
      'KEY_UPGRADE_STALE'
    );
    const winner = ['pk-a', 'pk-b'][won];
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
    });
    expect(user.publicKey).toBe(winner);
    expect(user.backup).toBe(`{"v":2,"from":"${winner}"}`);
  });

  it('refuses an upgrade built from keys that a reset replaced', async () => {
    await resetKeys(alice.id, {
      publicKey: 'reset-pk',
      backupKeypair: 'kp2',
      backupKeystring: 'ks2',
      backupSalt: 'salt2',
    });

    await expect(upgradeKeys(alice.id, base)).rejects.toThrow(
      'KEY_UPGRADE_STALE'
    );
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
    });
    expect(user).toMatchObject({
      publicKey: 'reset-pk',
      backup: null,
      backupVersion: 1,
      backupKeypair: 'kp2',
    });
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
