import {
  AccessLink,
  Container,
  ContainerType,
  ItemType,
  Prisma,
  PrismaClient,
  User,
  UserTier,
} from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Database fixtures for the share-link suites (#1393): a user who owns
 * regular folders, share-only containers, uploads, the items that point at
 * them, and access links. Every row is created at `at`, so a suite can place
 * its data in the past for age guards.
 */
export function shareFixtures(prisma: PrismaClient, at: () => Date) {
  let user: User;

  async function createUser() {
    user = await prisma.user.create({
      data: {
        publicKey: 'abc123',
        email: 'user@example.com',
        tier: UserTier.PRO,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return user;
  }

  /** Removes everything the user owns, then the user. */
  async function cleanup() {
    await prisma.accessLink.deleteMany({
      where: { share: { senderId: user.id } },
    });
    await prisma.share.deleteMany({ where: { senderId: user.id } });
    await prisma.item.deleteMany({ where: { upload: { ownerId: user.id } } });
    await prisma.upload.deleteMany({ where: { ownerId: user.id } });
    const containers = await prisma.container.findMany({
      where: { ownerId: user.id },
      select: { groupId: true },
    });
    // deleting the groups cascades to the containers and memberships
    await prisma.group.deleteMany({
      where: { id: { in: containers.map(({ groupId }) => groupId) } },
    });
    await prisma.user.delete({ where: { id: user.id } });
  }

  async function createContainer(
    shareOnly: boolean,
    createdAt: Date = at()
  ): Promise<Container> {
    const group = await prisma.group.create({ data: {} });
    return prisma.container.create({
      data: {
        name: shareOnly ? 'share container' : 'folder',
        ownerId: user.id,
        groupId: group.id,
        type: ContainerType.FOLDER,
        shareOnly,
        createdAt,
        updatedAt: createdAt,
      },
    });
  }

  function createUpload() {
    return prisma.upload.create({
      data: {
        size: 1000,
        ownerId: user.id,
        createdAt: at(),
        type: 'application/octet-stream',
      },
    });
  }

  function createItemIn(
    containerId: string,
    uploadId: string,
    wrappedKey: string = `wk-${uuidv4()}`
  ) {
    return prisma.item.create({
      data: {
        name: 'test.txt',
        wrappedKey,
        containerId,
        uploadId,
        type: ItemType.FILE,
        createdAt: at(),
        updatedAt: at(),
      },
    });
  }

  async function createLinkFor(
    containerId: string,
    expiryDate: Date | null = null,
    client: Prisma.TransactionClient | PrismaClient = prisma
  ): Promise<AccessLink> {
    const share = await client.share.create({
      data: { containerId, senderId: user.id },
    });
    return addLinkTo(share.id, expiryDate, client);
  }

  /** A further link on an existing Share, as `POST /sharing` adds one. */
  function addLinkTo(
    shareId: number,
    expiryDate: Date | null = null,
    client: Prisma.TransactionClient | PrismaClient = prisma
  ): Promise<AccessLink> {
    return client.accessLink.create({
      data: {
        id: uuidv4(),
        shareId,
        wrappedKey: 'wrapped-key',
        salt: 'salt',
        challengeKey: 'challenge-key',
        challengeSalt: 'challenge-salt',
        challengeCiphertext: 'ciphertext',
        challengePlaintext: 'plaintext',
        expiryDate,
      },
    });
  }

  /**
   * The shape #1393 is about: a file in a regular folder whose upload is
   * also referenced by a copy item in a share-only container with a link.
   */
  async function sharedFile(wrappedKey = 'wk-original') {
    const folder = await createContainer(false);
    const shareContainer = await createContainer(true);
    const upload = await createUpload();
    const item = await createItemIn(folder.id, upload.id, wrappedKey);
    const copy = await createItemIn(shareContainer.id, upload.id, 'wk-copy');
    const link = await createLinkFor(shareContainer.id);
    return { folder, shareContainer, upload, item, copy, link };
  }

  const exists = {
    container: (id: string) =>
      prisma.container.findUnique({ where: { id } }).then(Boolean),
    group: (id: number) =>
      prisma.group.findUnique({ where: { id } }).then(Boolean),
    item: (id: number) =>
      prisma.item.findUnique({ where: { id } }).then(Boolean),
    upload: (id: string) =>
      prisma.upload.findUnique({ where: { id } }).then(Boolean),
    accessLink: (id: string) =>
      prisma.accessLink.findUnique({ where: { id } }).then(Boolean),
  };

  return {
    get user() {
      return user;
    },
    createUser,
    cleanup,
    createContainer,
    createUpload,
    createItemIn,
    createLinkFor,
    addLinkTo,
    sharedFile,
    exists,
  };
}
