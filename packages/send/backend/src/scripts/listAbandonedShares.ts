import { PrismaClient } from '@prisma/client';
import {
  abandonedShareSweepOptionsFromEnv,
  abandonedShareWhere,
  decideAction,
  type ShareAction,
} from '../jobs/abandonedShareSweep';

// Read-only report of the abandoned shares the sweep would act on (#1393).
// Prints one JSON line per container with its proposed action, then a totals
// line. Check it before setting ABANDONED_SHARE_SWEEP_DRY_RUN=false.

const prisma = new PrismaClient();
const BATCH_SIZE = 200;

async function main() {
  const { olderThan, graceEnd } = abandonedShareSweepOptionsFromEnv();
  const now = new Date();
  const totals = {
    containers: 0,
    byAction: { reap: 0, sunset: 0, wait: 0 } as Record<ShareAction, number>,
    links: 0,
    uploads: new Set<string>(),
    pinnedBytes: 0n,
  };
  let afterId: string | undefined;

  for (;;) {
    const batch = await prisma.container.findMany({
      where: abandonedShareWhere(olderThan, afterId),
      select: {
        id: true,
        ownerId: true,
        createdAt: true,
        items: {
          select: {
            upload: { select: { id: true, size: true } },
          },
        },
        shares: {
          select: {
            accessLinks: { select: { expiryDate: true, locked: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;

    for (const container of batch) {
      const links = container.shares.flatMap(({ accessLinks }) => accessLinks);
      const { action } = decideAction(links, now, graceEnd);

      totals.containers++;
      totals.byAction[action]++;
      totals.links += links.length;
      for (const { upload } of container.items) {
        if (!totals.uploads.has(upload.id)) {
          totals.uploads.add(upload.id);
          totals.pinnedBytes += upload.size;
        }
      }

      console.log(
        JSON.stringify({
          container: container.id,
          owner: container.ownerId,
          createdAt: container.createdAt,
          action,
          uploads: container.items.map(({ upload }) => ({
            id: upload.id,
            size: Number(upload.size),
          })),
          links: links.map(({ expiryDate, locked }) => ({
            expiryDate,
            locked,
          })),
        })
      );
    }

    if (batch.length < BATCH_SIZE) break;
    afterId = batch[batch.length - 1].id;
  }

  console.log(
    JSON.stringify({
      totals: {
        containers: totals.containers,
        reapNow: totals.byAction.reap,
        sunset: totals.byAction.sunset,
        waiting: totals.byAction.wait,
        links: totals.links,
        uploads: totals.uploads.size,
        pinnedBytes: Number(totals.pinnedBytes),
      },
      olderThan,
      graceEnd,
    })
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
