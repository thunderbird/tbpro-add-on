import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sweepAbandonedShares } from '../../jobs/abandonedShareSweep';
import { runSweepIfLeader } from '../../jobs/orphanSweep';
import { shareFixtures } from '../shareFixtures';

vi.mock('../../storage', () => ({
  default: {
    del: vi.fn(),
    listObjects: vi.fn(() => Promise.resolve({ objects: [] })),
  },
}));

// Abandoned share sweep (#1393) against a real database: pre-fix file
// deletions left share-only containers whose links kept resolving and whose
// copy items pinned the uploads forever. The sweep reaps the ones no link
// resolves any more, sunsets the links that still resolve, and leaves every
// live share and every fresh container alone.

const prisma = new PrismaClient();

const OLD = new Date('2020-01-01T00:00:00Z');
const PAST = new Date('2024-01-01T00:00:00Z');
const FUTURE = new Date('2030-01-01T00:00:00Z');
const LATER_GRACE_END = new Date('2027-07-01T00:00:00Z');

// every fixture row is old enough to pass the sweep's age guard
const fx = shareFixtures(prisma, () => OLD);
const { createContainer, createUpload, createItemIn, createLinkFor, exists } =
  fx;

function options(
  overrides: Partial<Parameters<typeof sweepAbandonedShares>[0]> = {}
) {
  return {
    olderThan: new Date(Date.now() - 60 * 60 * 1000),
    graceEnd: new Date('2027-06-01T00:00:00Z'),
    dryRun: false,
    maxActions: 1000,
    deadline: Infinity,
    ...overrides,
  };
}

/** An abandoned share: copy item only, its original deleted pre-fix. */
async function abandonedShare(expiryDate: Date | null) {
  const shareContainer = await createContainer(true);
  const upload = await createUpload();
  await createItemIn(shareContainer.id, upload.id);
  const link = await createLinkFor(shareContainer.id, expiryDate);
  return { shareContainer, upload, link };
}

function expiryOf(linkId: string) {
  return prisma.accessLink
    .findUnique({ where: { id: linkId } })
    .then((link) => link?.expiryDate);
}

describe('sweepAbandonedShares', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await fx.createUser();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fx.cleanup();
  });

  it('reaps an abandoned share whose link is expired and frees its upload', async () => {
    const { shareContainer, upload, link } = await abandonedShare(PAST);

    const result = await sweepAbandonedShares(options());

    expect(result).toMatchObject({ scanned: 1, reaped: 1, errors: 0 });
    expect(await exists.container(shareContainer.id)).toBe(false);
    expect(await exists.group(shareContainer.groupId)).toBe(false);
    expect(await exists.accessLink(link.id)).toBe(false);
    // the upload is now a row orphan for the orphan sweep to delete
    expect(await prisma.item.count({ where: { uploadId: upload.id } })).toBe(0);
    expect(await exists.upload(upload.id)).toBe(true);
  });

  it('reaps under the orphan sweep lock and frees the upload in the same run', async () => {
    vi.stubEnv('ABANDONED_SHARE_SWEEP_DRY_RUN', 'false');
    const { shareContainer, upload } = await abandonedShare(PAST);

    await runSweepIfLeader();

    expect(await exists.container(shareContainer.id)).toBe(false);
    expect(await exists.upload(upload.id)).toBe(false);
  }, 20_000);

  it('sunsets a link that still resolves instead of cutting it off', async () => {
    const { shareContainer, link } = await abandonedShare(null);

    const result = await sweepAbandonedShares(options());

    expect(result).toMatchObject({ scanned: 1, graced: 1, reaped: 0 });
    expect(await exists.container(shareContainer.id)).toBe(true);
    expect(await expiryOf(link.id)).toEqual(options().graceEnd);
  });

  it('reaps a sunset share once its grace period has passed', async () => {
    await abandonedShare(null);
    await sweepAbandonedShares(options());

    // still waiting while the grace period runs
    const afterGrace = await sweepAbandonedShares(
      options({ graceEnd: LATER_GRACE_END })
    );
    expect(afterGrace).toMatchObject({ waiting: 1, reaped: 0, graced: 0 });

    // move the sunset into the past, as a later daily run would find it
    await prisma.accessLink.updateMany({
      where: { share: { senderId: fx.user.id } },
      data: { expiryDate: PAST },
    });
    expect(await sweepAbandonedShares(options())).toMatchObject({ reaped: 1 });
  });

  it('does not re-push an existing sunset on later runs', async () => {
    const { link } = await abandonedShare(null);
    await sweepAbandonedShares(options());
    const first = await expiryOf(link.id);

    const again = await sweepAbandonedShares(
      options({ graceEnd: LATER_GRACE_END })
    );

    expect(again).toMatchObject({ waiting: 1, graced: 0 });
    expect(await expiryOf(link.id)).toEqual(first);
  });

  it('keeps a container that gained a working link after the batch was read', async () => {
    const { shareContainer } = await abandonedShare(PAST);
    // Hold the row lock the reap takes, as a concurrent POST /sharing would
    // while it inserts its Share/AccessLink, and create a link under it. The
    // sweep's batch read sees only the expired link; its reap then waits for
    // this transaction and must find the new link once it commits.
    let run: ReturnType<typeof sweepAbandonedShares>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Container" WHERE id = ${shareContainer.id}::uuid FOR UPDATE`;
      run = sweepAbandonedShares(options());
      // give the sweep time to read its batch and block on the lock
      await new Promise((resolve) => setTimeout(resolve, 300));
      await createLinkFor(shareContainer.id, FUTURE, tx);
    });
    const result = await run!;

    expect(result).toMatchObject({ scanned: 1, reaped: 0, waiting: 1 });
    expect(await exists.container(shareContainer.id)).toBe(true);
    expect(
      await prisma.accessLink.count({
        where: { share: { containerId: shareContainer.id } },
      })
    ).toBe(2);
  }, 15_000);

  it('leaves a share alone while its upload still has a regular item', async () => {
    const folder = await createContainer(false);
    const shareContainer = await createContainer(true);
    const upload = await createUpload();
    await createItemIn(folder.id, upload.id);
    await createItemIn(shareContainer.id, upload.id);
    const link = await createLinkFor(shareContainer.id, null);

    const result = await sweepAbandonedShares(options());

    expect(result).toMatchObject({ scanned: 0 });
    expect(await expiryOf(link.id)).toBeNull();
  });

  it('leaves a fresh container alone even when it looks abandoned', async () => {
    const shareContainer = await createContainer(true, new Date());
    const upload = await createUpload();
    await createItemIn(shareContainer.id, upload.id);
    await createLinkFor(shareContainer.id, PAST);

    const result = await sweepAbandonedShares(options());

    expect(result).toMatchObject({ scanned: 0, reaped: 0 });
    expect(await exists.container(shareContainer.id)).toBe(true);
  });

  it('reaps an old share-only container with no items and no links', async () => {
    const debris = await createContainer(true);

    const result = await sweepAbandonedShares(options());

    expect(result).toMatchObject({ scanned: 1, reaped: 1 });
    expect(await exists.container(debris.id)).toBe(false);
  });

  it('changes nothing in a dry run', async () => {
    const reapable = await abandonedShare(PAST);
    const graceable = await abandonedShare(FUTURE);

    const result = await sweepAbandonedShares(options({ dryRun: true }));

    expect(result).toMatchObject({
      scanned: 2,
      reaped: 1,
      graced: 1,
      dryRun: true,
    });
    expect(await exists.container(reapable.shareContainer.id)).toBe(true);
    expect(await expiryOf(graceable.link.id)).toEqual(FUTURE);
  });
});
