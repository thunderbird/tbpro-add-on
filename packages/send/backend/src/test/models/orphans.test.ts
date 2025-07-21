import { describe, it, expect, beforeEach } from 'vitest';
import { createItem, findOrphans } from '../../models';

import { Container, ContainerType, Group, ItemType, User, UserTier } from '@prisma/client';
import { prisma } from '../setup';

describe('findOrphans', () => {
  let user: User;
  let group: Group;
  let container: Container;

  beforeEach(async () => {
    // Clear out the in-memory database before each test.
    // Reasonably fast way to ensure clean database.
    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);

    const tablenames = await prisma.$queryRaw<
      Array<{ name: string }>
    >`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`;

    for (const { name } of tablenames) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${name}";`);
    }

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

  it('should return uploads without associated items', async () => {
    // Create two uploads without items.
    // Use `prisma.upload.create` to get around the size-on-disk check.
    await prisma.upload.create({
      data: {
        id: 'upload1',
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });
    await prisma.upload.create({
      data: {
        id: 'upload2',
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });

    const result = await findOrphans();
    expect(result.uploadIds).toEqual(['upload1', 'upload2']);
  });

  it('should return an empty array when no orphans exist', async () => {
    const result = await findOrphans();
    expect(result.uploadIds).toEqual([]);
  });

  it('should exclude uploads that have associated items', async () => {
    // Use `prisma.upload.create` to get around the size-on-disk check.
    const upload1 = await prisma.upload.create({
      data: {
        id: 'upload1',
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });
    const upload2 = await prisma.upload.create({
      data: {
        id: 'upload2',
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });
    await prisma.upload.create({
      data: {
        id: 'truly-orphaned-upload',
        size: 1000,
        ownerId: user.id,
        createdAt: new Date(),
        type: 'application/octet-stream',
      },
    });

    // Create items for the first two uploads
    await createItem('item1', container.id, upload1.id, ItemType.FILE, 'abc123');
    await createItem('item2', container.id, upload2.id, ItemType.FILE, 'abc123');

    const result = await findOrphans();
    expect(result.uploadIds).toEqual(['truly-orphaned-upload']);
  });
});
