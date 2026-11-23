import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageDel = vi.hoisted(() => vi.fn());
vi.mock('../../storage', () => ({ default: { del: storageDel } }));

import { deleteItem } from '../../models';
import { burnFolder, getContainerForAccessLink } from '../../models/sharing';
import { shareFixtures } from '../shareFixtures';

// Deleting an upload's last regular-folder item also burns the share-only
// containers holding copies of it, revoking their access links (#1393). A share
// container that still holds other files keeps its link.

const prisma = new PrismaClient();
const fx = shareFixtures(prisma, () => new Date());
const otherUser = shareFixtures(prisma, () => new Date());
const {
  createContainer,
  createUpload,
  createItemIn,
  createLinkFor,
  sharedFile,
  exists,
} = fx;

describe('deleteItem share-link revocation', () => {
  beforeEach(async () => {
    storageDel.mockReset();
    await fx.createUser();
  });
  afterEach(() => fx.cleanup());

  it('revokes the access link when the only item for its upload is deleted', async () => {
    const { folder, shareContainer, upload, item, link } = await sharedFile();

    await deleteItem(item.id, folder.id, fx.user.id, true);

    expect(await exists.accessLink(link.id)).toBe(false);
    expect(
      await prisma.share.count({ where: { containerId: shareContainer.id } })
    ).toBe(0);
    expect(await exists.container(shareContainer.id)).toBe(false);
    expect(await exists.group(shareContainer.groupId)).toBe(false);
    expect(await prisma.item.count({ where: { uploadId: upload.id } })).toBe(0);
    expect(await exists.upload(upload.id)).toBe(false);
    expect(storageDel).toHaveBeenCalledWith(upload.id);
  });

  it('keeps the link while the share container still holds another file', async () => {
    const folder = await createContainer(false);
    const shareContainer = await createContainer(true);
    const uploadA = await createUpload();
    const uploadB = await createUpload();
    const itemA = await createItemIn(folder.id, uploadA.id, 'wk-a');
    await createItemIn(folder.id, uploadB.id, 'wk-b');
    await createItemIn(shareContainer.id, uploadA.id, 'wk-a-copy');
    const copyB = await createItemIn(
      shareContainer.id,
      uploadB.id,
      'wk-b-copy'
    );
    const link = await createLinkFor(shareContainer.id);

    await deleteItem(itemA.id, folder.id, fx.user.id, true);

    // the deleted file's copy is gone and its upload is orphan-deleted...
    expect(await prisma.item.count({ where: { uploadId: uploadA.id } })).toBe(
      0
    );
    expect(await exists.upload(uploadA.id)).toBe(false);
    // ...but the link still serves the remaining file
    expect(await exists.accessLink(link.id)).toBe(true);
    expect(await exists.container(shareContainer.id)).toBe(true);
    expect(await exists.item(copyB.id)).toBe(true);
  });

  it('keeps the link while another regular folder references the upload', async () => {
    const { folder, upload, item, copy, link } = await sharedFile();
    const otherFolder = await createContainer(false);
    const kept = await createItemIn(otherFolder.id, upload.id, 'wk-other');

    await deleteItem(item.id, folder.id, fx.user.id, true);

    expect(await exists.item(kept.id)).toBe(true);
    expect(await exists.item(copy.id)).toBe(true);
    expect(await exists.accessLink(link.id)).toBe(true);
    expect(await exists.upload(upload.id)).toBe(true);
  });

  it('burns every part copy of a multipart file', async () => {
    const folder = await createContainer(false);
    const shareContainer = await createContainer(true);
    const part1 = await createUpload();
    const part2 = await createUpload();
    // multipart siblings share a wrappedKey within the folder
    const item1 = await createItemIn(folder.id, part1.id, 'wk-multipart');
    await createItemIn(folder.id, part2.id, 'wk-multipart');
    await createItemIn(shareContainer.id, part1.id, 'wk-copy-1');
    await createItemIn(shareContainer.id, part2.id, 'wk-copy-2');
    const link = await createLinkFor(shareContainer.id);

    await deleteItem(item1.id, folder.id, fx.user.id, true);

    expect(await exists.accessLink(link.id)).toBe(false);
    expect(await exists.container(shareContainer.id)).toBe(false);
    expect(
      await prisma.upload.count({ where: { id: { in: [part1.id, part2.id] } } })
    ).toBe(0);
  });

  it('revokes the link when two folders delete the same upload at once', async () => {
    // Holding both folder rows makes the deletes overlap; fails without the upload lock.
    const { folder, upload, item, copy, link } = await sharedFile();
    const otherFolder = await createContainer(false);
    const other = await createItemIn(otherFolder.id, upload.id, 'wk-other');

    let deletes: Promise<unknown>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Container" WHERE id IN (${folder.id}::uuid, ${otherFolder.id}::uuid) FOR UPDATE`;
      deletes = Promise.all([
        deleteItem(item.id, folder.id, fx.user.id, true),
        deleteItem(other.id, otherFolder.id, fx.user.id, true),
      ]);
      // give both deletes time to run their checks and block
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await deletes!;

    expect(await exists.item(copy.id)).toBe(false);
    expect(await exists.accessLink(link.id)).toBe(false);
    expect(await exists.upload(upload.id)).toBe(false);
  });

  it('revokes the link when two files of one share are deleted at once', async () => {
    // Holding the folder row makes the deletes overlap; fails without the container lock.
    const folder = await createContainer(false);
    const shareContainer = await createContainer(true);
    const uploadA = await createUpload();
    const uploadB = await createUpload();
    const itemA = await createItemIn(folder.id, uploadA.id, 'wk-a');
    const itemB = await createItemIn(folder.id, uploadB.id, 'wk-b');
    await createItemIn(shareContainer.id, uploadA.id, 'wk-a-copy');
    await createItemIn(shareContainer.id, uploadB.id, 'wk-b-copy');
    const link = await createLinkFor(shareContainer.id);

    let deletes: Promise<unknown>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Container" WHERE id = ${folder.id}::uuid FOR UPDATE`;
      deletes = Promise.all([
        deleteItem(itemA.id, folder.id, fx.user.id, true),
        deleteItem(itemB.id, folder.id, fx.user.id, true),
      ]);
      // give both deletes time to run their checks and block
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await deletes!;

    expect(await exists.accessLink(link.id)).toBe(false);
    expect(await exists.container(shareContainer.id)).toBe(false);
    expect(await exists.group(shareContainer.groupId)).toBe(false);
  });

  it("keeps another user's share of the same upload", async () => {
    const { folder, upload, item, link } = await sharedFile();
    await otherUser.createUser();
    try {
      const theirShare = await otherUser.createContainer(true);
      const theirCopy = await otherUser.createItemIn(theirShare.id, upload.id);
      const theirLink = await otherUser.createLinkFor(theirShare.id);

      await deleteItem(item.id, folder.id, fx.user.id, true);

      expect(await exists.accessLink(link.id)).toBe(false);
      const resolved = await getContainerForAccessLink(theirLink.id);
      expect(resolved.items.map(({ id }) => id)).toEqual([theirCopy.id]);
      expect(await exists.upload(upload.id)).toBe(true);
      expect(storageDel).not.toHaveBeenCalled();
    } finally {
      await prisma.item.deleteMany({ where: { uploadId: upload.id } });
      await otherUser.cleanup();
    }
  });

  it('deletes a copy whose own share container the delete burns', async () => {
    const shareContainer = await createContainer(true);
    const upload = await createUpload();
    const copy = await createItemIn(shareContainer.id, upload.id, 'wk-1');
    await createItemIn(shareContainer.id, upload.id, 'wk-2');
    const link = await createLinkFor(shareContainer.id);

    await deleteItem(copy.id, shareContainer.id, fx.user.id, true);

    expect(await exists.accessLink(link.id)).toBe(false);
    expect(await exists.container(shareContainer.id)).toBe(false);
    expect(await exists.upload(upload.id)).toBe(false);
  });

  it('keeps a share container that has no link yet', async () => {
    const { folder, item, upload } = await sharedFile();
    const filling = await createContainer(true);
    const copy = await createItemIn(filling.id, upload.id, 'wk-filling');

    await deleteItem(item.id, folder.id, fx.user.id, true);

    expect(await exists.item(copy.id)).toBe(false);
    expect(await exists.container(filling.id)).toBe(true);
    const other = await createUpload();
    await expect(createItemIn(filling.id, other.id)).resolves.toBeTruthy();
  });

  it('revokes the link when the folder holding the file is deleted', async () => {
    const { folder, shareContainer, upload, link } = await sharedFile();

    await burnFolder(folder.id, true);

    expect(await exists.container(folder.id)).toBe(false);
    expect(await exists.accessLink(link.id)).toBe(false);
    expect(await exists.container(shareContainer.id)).toBe(false);
    expect(await exists.upload(upload.id)).toBe(false);
    expect(storageDel).toHaveBeenCalledWith(upload.id);
  });

  it('deletes only the item in the given container', async () => {
    const { folder, item, upload } = await sharedFile('wk-same');
    const otherFolder = await createContainer(false);
    const kept = await createItemIn(otherFolder.id, upload.id, 'wk-same');

    await deleteItem(item.id, folder.id, fx.user.id, true);

    expect(await exists.item(item.id)).toBe(false);
    expect(await exists.item(kept.id)).toBe(true);
    expect(await exists.upload(upload.id)).toBe(true);
    expect(storageDel).not.toHaveBeenCalled();
  });

  it('deletes stored bytes only after the rows are committed', async () => {
    const { folder, item } = await sharedFile();
    const rowAtStorageDelete: unknown[] = [];
    storageDel.mockImplementation(async (id: string) => {
      // a second connection sees only committed rows
      rowAtStorageDelete.push(
        await prisma.upload.findUnique({ where: { id } })
      );
    });

    await deleteItem(item.id, folder.id, fx.user.id, true);

    expect(rowAtStorageDelete).toEqual([null]);
  });

  it('still resolves when storage deletion fails', async () => {
    const { folder, upload, item } = await sharedFile();
    storageDel.mockRejectedValue(new Error('bucket down'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      await expect(
        deleteItem(item.id, folder.id, fx.user.id, true)
      ).resolves.toEqual({ wrappedKey: item.wrappedKey });
      expect(await exists.upload(upload.id)).toBe(false);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps the link when the content is kept', async () => {
    const { folder, item, copy, upload, link } = await sharedFile();

    await deleteItem(item.id, folder.id, fx.user.id, false);

    expect(await exists.item(copy.id)).toBe(true);
    expect(await exists.accessLink(link.id)).toBe(true);
    expect(await exists.upload(upload.id)).toBe(true);
  });
});
