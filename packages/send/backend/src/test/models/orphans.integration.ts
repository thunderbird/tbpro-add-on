import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterEach,
  vi,
} from 'vitest';
import {
  PrismaClient,
  Container,
  ContainerType,
  Group,
  ItemType,
  User,
  UserTier,
  Item,
  Upload,
} from '@prisma/client';
import { createItem, deleteOrphans, findOrphans } from '../../models';
import { sweepExpiredPendingUploads } from '../../models/pendingUploads';

// Storage is mocked so the test runs without a bucket; the calls show which
// objects the cleanup removed.
const { storageDel } = vi.hoisted(() => ({ storageDel: vi.fn() }));
vi.mock('../../storage', () => ({ default: { del: storageDel } }));

// Older than the default 24h age guard.
const OLD = new Date(Date.now() - 48 * 60 * 60 * 1000);

describe('findOrphans', () => {
  let user: User;
  let group: Group;
  let container: Container;
  let items: Item[] = [];
  let uploads: Upload[] = [];
  const prisma = new PrismaClient();

  async function cleanUp() {
    const uploadPromises = uploads.map((upload) => {
      return prisma.upload.deleteMany({
        where: {
          id: upload.id,
        },
      });
    });

    const itemPromises = items.map((item) => {
      return prisma.item.deleteMany({
        where: {
          id: item.id,
        },
      });
    });

    await Promise.all(itemPromises);
    await Promise.all(uploadPromises);
    await prisma.pendingUpload.deleteMany({ where: { ownerId: user.id } });

    try {
      await prisma.group.delete({
        where: {
          id: group.id,
        },
      });

      await prisma.container.delete({
        where: {
          id: container.id,
        },
      });

      await prisma.user.delete({
        where: {
          id: user.id,
        },
      });
    } catch {
      // cleanup errors are intentionally ignored
    }

    items = [];
    uploads = [];
  }

  async function _deleteAll() {
    console.warn(`💥💥💥 destroying all Items and all Uploads 💥💥💥`);
    await prisma.item.deleteMany({});
    await prisma.upload.deleteMany({});
    items = [];
    uploads = [];
  }

  beforeEach(async () => {
    // Dummy user, group, and container for tests.
    user = await prisma.user.create({
      data: {
        publicKey: 'abc123',
        email: 'user@example.com',
        tier: UserTier.PRO,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    group = await prisma.group.create({
      data: {},
    });

    container = await prisma.container.create({
      data: {
        name: 'container1',
        ownerId: user.id,
        groupId: group.id,
        type: ContainerType.FOLDER,
        shareOnly: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    await cleanUp();
  });

  beforeAll(async () => {
    // Be careful with this.
    // Make sure you're not running this test against a database with real data.
    // await _deleteAll();
  });

  it('should return uploads without associated items', async () => {
    // Create two uploads without items.
    // Use `prisma.upload.create` to get around the size-on-disk check.
    const upload1 = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: OLD,
        type: 'application/octet-stream',
      },
    });
    const upload2 = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: OLD,
        type: 'application/octet-stream',
      },
    });
    uploads.push(upload1);
    uploads.push(upload2);
    const result = await findOrphans();
    expect(result.uploadIds.sort()).toEqual([upload1.id, upload2.id].sort());
  });

  it('should return an empty array when no orphans exist', async () => {
    const result = await findOrphans();
    expect(result.uploadIds).toEqual([]);
  });

  it('should exclude uploads that have associated items', async () => {
    // Use `prisma.upload.create` to get around the size-on-disk check.
    const upload1 = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: OLD,
        type: 'application/octet-stream',
      },
    });
    const upload2 = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: OLD,
        type: 'application/octet-stream',
      },
    });
    const orphanedUpload = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: OLD,
        type: 'application/octet-stream',
      },
    });

    uploads.push(upload1);
    uploads.push(upload2);
    uploads.push(orphanedUpload);

    // Create items for the first two uploads
    items.push(
      await createItem(
        'item1',
        container.id,
        upload1.id,
        ItemType.FILE,
        'abc123'
      )
    );
    items.push(
      await createItem(
        'item2',
        container.id,
        upload2.id,
        ItemType.FILE,
        'abc123'
      )
    );

    const result = await findOrphans();
    expect(result.uploadIds).toEqual([orphanedUpload.id]);
  });

  it('ignores item-less uploads younger than hoursSinceCreation', async () => {
    const fresh = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });
    uploads.push(fresh);

    expect((await findOrphans(24)).uploadIds).toEqual([]);
    expect((await findOrphans(0)).uploadIds).toEqual([fresh.id]);
  });

  it('deleteOrphans removes rows and bytes of uploads left by a deleted folder', async () => {
    storageDel.mockResolvedValue(true);
    const kept = await prisma.upload.create({
      data: { size: 1000, ownerId: user.id, createdAt: OLD, type: 'x' },
    });
    const orphaned = await prisma.upload.create({
      data: { size: 1000, ownerId: user.id, createdAt: OLD, type: 'x' },
    });
    uploads.push(kept, orphaned);
    items.push(
      await createItem('kept', container.id, kept.id, ItemType.FILE, 'k1')
    );

    // Deleting a folder cascades to its items but leaves their uploads.
    const doomed = await prisma.container.create({
      data: {
        name: 'doomed',
        ownerId: user.id,
        groupId: (await prisma.group.create({ data: {} })).id,
        type: ContainerType.FOLDER,
        createdAt: OLD,
        updatedAt: OLD,
      },
    });
    await createItem('gone', doomed.id, orphaned.id, ItemType.FILE, 'k2');
    await prisma.group.delete({ where: { id: doomed.groupId } });

    const result = await deleteOrphans();

    expect(result.deletedUploadIds).toEqual([orphaned.id]);
    expect(storageDel).toHaveBeenCalledWith(orphaned.id);
    expect(storageDel).not.toHaveBeenCalledWith(kept.id);
    expect(
      await prisma.upload.findUnique({ where: { id: orphaned.id } })
    ).toBeNull();
    expect(
      await prisma.upload.findUnique({ where: { id: kept.id } })
    ).not.toBeNull();
  });

  it('sweeps the bytes of an expired reservation that was never finalized', async () => {
    storageDel.mockResolvedValue(true);
    const pending = await prisma.pendingUpload.create({
      data: {
        id: '00000000-0000-4000-8000-0000000000aa',
        ownerId: user.id,
        size: 1000,
        expiresAt: OLD,
      },
    });

    const result = await sweepExpiredPendingUploads(24);

    expect(result.deletedIds).toEqual([pending.id]);
    expect(storageDel).toHaveBeenCalledWith(pending.id);
    expect(
      await prisma.pendingUpload.findUnique({ where: { id: pending.id } })
    ).toBeNull();
  });
});
