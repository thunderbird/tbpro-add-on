import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient, Container, ContainerType, Group, ItemType, User, UserTier, Item, Upload } from '@prisma/client';
import { createItem, findOrphans } from '../../models';

describe('findOrphans', () => {
  let user: User;
  let group: Group;
  let container: Container;
  let items: Item[] = [];
  let uploads: Upload[] = [];
  const prisma = new PrismaClient();

  async function cleanUp() {
    const uploadPromises = uploads.map((upload) => {
      return prisma.upload.delete({
        where: {
          id: upload.id
        }
      });
    })

    const itemPromises = items.map((item) => {
      return prisma.item.delete({
        where: {
          id: item.id
        }
      })
    })

    await Promise.all(itemPromises);
    await Promise.all(uploadPromises);

    try {
      await prisma.group.delete({
        where: {
          id: group.id
        }
      });

      await prisma.container.delete({
        where: {
          id: container.id
        }
      });

      await prisma.user.delete({
        where: {
          id: user.id
        }
      });
    } catch {

    }

    items = [];
    uploads = [];
  }

  async function deleteAll() {
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
      data: {}
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
      }
    })
  });

  afterEach(async () => {
    await cleanUp();
  });

  beforeAll(async () => {
    // Be careful with this.
    // Make sure you're not running this test against a database with real data.
    // await deleteAll();
  });

  it('should return uploads without associated items', async () => {
    // Create two uploads without items.
    // Use `prisma.upload.create` to get around the size-on-disk check.
    const upload1 = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });
    const upload2 = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });
    uploads.push(upload1);
    uploads.push(upload2);
    const result = await findOrphans();
    expect(result.uploadIds).toEqual([upload1.id, upload2.id]);
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
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });
    const upload2 = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });
    const orphanedUpload = await prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });

    uploads.push(upload1);
    uploads.push(upload2);
    uploads.push(orphanedUpload);

    // Create items for the first two uploads
    items.push(await createItem('item1', container.id, upload1.id, ItemType.FILE, 'abc123'));
    items.push(await createItem('item2', container.id, upload2.id, ItemType.FILE, 'abc123'));

    const result = await findOrphans();
    expect(result.uploadIds).toEqual([orphanedUpload.id]);
  });
});
