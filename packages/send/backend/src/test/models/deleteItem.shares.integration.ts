import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteItem } from '../../models';
import { shareFixtures } from '../shareFixtures';

// Deleting an upload's last regular-folder item also burns the share-only
// containers holding copies of it, revoking their access links (#1393). A share
// container that still holds other files keeps its link.

const prisma = new PrismaClient();
const fx = shareFixtures(prisma, () => new Date());
const {
  createContainer,
  createUpload,
  createItemIn,
  createLinkFor,
  sharedFile,
  exists,
} = fx;

describe('deleteItem share-link revocation', () => {
  beforeEach(() => fx.createUser());
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
    // Two regular folders hold the upload; both items are deleted at the same
    // moment. Without row locks each delete still sees the other's item and
    // both skip the cleanup, leaving the share copy, link and upload behind.
    const { folder, upload, item, copy, link } = await sharedFile();
    const otherFolder = await createContainer(false);
    const other = await createItemIn(otherFolder.id, upload.id, 'wk-other');

    await Promise.all([
      deleteItem(item.id, folder.id, fx.user.id, true),
      deleteItem(other.id, otherFolder.id, fx.user.id, true),
    ]);

    expect(await exists.item(copy.id)).toBe(false);
    expect(await exists.accessLink(link.id)).toBe(false);
    expect(await exists.upload(upload.id)).toBe(false);
  });

  it('keeps the link when the content is kept', async () => {
    const { folder, item, copy, upload, link } = await sharedFile();

    await deleteItem(item.id, folder.id, fx.user.id, false);

    expect(await exists.item(copy.id)).toBe(true);
    expect(await exists.accessLink(link.id)).toBe(true);
    expect(await exists.upload(upload.id)).toBe(true);
  });
});
