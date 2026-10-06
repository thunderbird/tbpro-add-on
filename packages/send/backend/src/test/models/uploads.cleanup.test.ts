import { beforeEach, describe, expect, it, vi } from 'vitest';

// Ownership binding for POST /api/uploads/cleanup: an id is only acted on when
// the server can attribute it to the caller — via the Upload row's owner when a
// row exists, or via the ownership tag minted into the id itself for row-less
// storage-only orphans. Unattributable ids are skipped, never deleted.

const h = vi.hoisted(() => {
  const prisma = {
    upload: { findMany: vi.fn(), delete: vi.fn() },
  };
  const storageDel = vi.fn();
  return { prisma, storageDel };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
  ContainerType: { CONVERSATION: 'CONVERSATION', FOLDER: 'FOLDER' },
  ItemType: { FILE: 'FILE', MESSAGE: 'MESSAGE' },
  InvitationStatus: { PENDING: 'PENDING', ACCEPTED: 'ACCEPTED' },
  UserTier: { FREE: 'FREE', PRO: 'PRO', EPHEMERAL: 'EPHEMERAL' },
}));

vi.mock('../../storage', () => ({
  default: { del: h.storageDel },
}));

import { deleteUploadsByIds } from '../../models';
import { mintOwnedUploadId } from '../../utils/ownedUploadId';

process.env.ACCESS_TOKEN_SECRET = 'cleanup-test-secret';

const REQUESTER = 'user-req';
const OTHER = 'user-other';

// Seed the Upload-row lookup deleteUploadsByIds performs. Each arg lists the
// ids present with that owner.
function seed({ ownedRows = [] as string[], foreignRows = [] as string[] }) {
  h.prisma.upload.findMany.mockResolvedValue([
    ...ownedRows.map((id) => ({ id, ownerId: REQUESTER })),
    ...foreignRows.map((id) => ({ id, ownerId: OTHER })),
  ]);
}

describe('deleteUploadsByIds ownership binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.upload.delete.mockResolvedValue({});
    h.storageDel.mockResolvedValue(undefined);
  });

  it('deletes an upload row owned by the requester (bytes + row)', async () => {
    seed({ ownedRows: ['own'] });

    const result = await deleteUploadsByIds(['own'], REQUESTER);

    expect(result.deleted).toEqual(['own']);
    expect(result.skipped).toEqual([]);
    expect(h.storageDel).toHaveBeenCalledWith('own');
    expect(h.prisma.upload.delete).toHaveBeenCalledWith({
      where: { id: 'own' },
    });
  });

  it("skips another user's upload row without touching bytes or row", async () => {
    seed({ foreignRows: ['theirs'] });

    const result = await deleteUploadsByIds(['theirs'], REQUESTER);

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual(['theirs']);
    expect(h.storageDel).not.toHaveBeenCalled();
    expect(h.prisma.upload.delete).not.toHaveBeenCalled();
  });

  it('skips an untagged row-less id (legacy orphan or unknown) without touching storage', async () => {
    seed({});

    const result = await deleteUploadsByIds(['orphan'], REQUESTER);

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual(['orphan']);
    expect(h.storageDel).not.toHaveBeenCalled();
    expect(h.prisma.upload.delete).not.toHaveBeenCalled();
  });

  it("deletes a row-less orphan's bytes for the caller it was minted for (no row touched)", async () => {
    const id = mintOwnedUploadId(REQUESTER);
    seed({});

    const result = await deleteUploadsByIds([id], REQUESTER);

    expect(result.deleted).toEqual([id]);
    expect(result.skipped).toEqual([]);
    expect(h.storageDel).toHaveBeenCalledWith(id);
    expect(h.prisma.upload.delete).not.toHaveBeenCalled();
  });

  it('skips a row-less id minted for someone else', async () => {
    const id = mintOwnedUploadId(OTHER);
    seed({});

    const result = await deleteUploadsByIds([id], REQUESTER);

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual([id]);
    expect(h.storageDel).not.toHaveBeenCalled();
  });

  it('skips a row-less id with a tampered ownership tag', async () => {
    const minted = mintOwnedUploadId(REQUESTER);
    const last = minted[minted.length - 1];
    const tampered = minted.slice(0, -1) + (last === '0' ? '1' : '0');
    seed({});

    const result = await deleteUploadsByIds([tampered], REQUESTER);

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual([tampered]);
    expect(h.storageDel).not.toHaveBeenCalled();
  });

  it("row ownership wins over the mint tag: skips the caller's minted id once someone else owns its row", async () => {
    const id = mintOwnedUploadId(REQUESTER);
    seed({ foreignRows: [id] });

    const result = await deleteUploadsByIds([id], REQUESTER);

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual([id]);
    expect(h.storageDel).not.toHaveBeenCalled();
    expect(h.prisma.upload.delete).not.toHaveBeenCalled();
  });

  it('treats a failed storage.del on a verified row-less orphan as non-fatal (best-effort)', async () => {
    const id = mintOwnedUploadId(REQUESTER);
    seed({});
    h.storageDel.mockRejectedValueOnce(new Error('bucket down'));

    const result = await deleteUploadsByIds([id], REQUESTER);

    expect(result.deleted).toEqual([id]);
    expect(result.errors).toEqual([]);
  });

  it('handles a mixed batch: deletes only the owned row, skips the rest', async () => {
    seed({ ownedRows: ['own'], foreignRows: ['theirs'] });

    const result = await deleteUploadsByIds(
      ['own', 'theirs', 'ghost'],
      REQUESTER
    );

    expect(result.deleted).toEqual(['own']);
    expect(result.skipped.sort()).toEqual(['ghost', 'theirs']);
    expect(h.storageDel).toHaveBeenCalledTimes(1);
    expect(h.storageDel).toHaveBeenCalledWith('own');
  });

  it('is idempotent for a repeated id (processed once)', async () => {
    seed({ ownedRows: ['own'] });

    const result = await deleteUploadsByIds(['own', 'own'], REQUESTER);

    expect(result.deleted).toEqual(['own']);
    expect(h.storageDel).toHaveBeenCalledTimes(1);
  });

  it('reports a failed row delete in errors and keeps going', async () => {
    seed({ ownedRows: ['own', 'own2'] });
    h.prisma.upload.delete
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({});

    const result = await deleteUploadsByIds(['own', 'own2'], REQUESTER);

    expect(result.errors.length + result.deleted.length).toBe(2);
  });
});
