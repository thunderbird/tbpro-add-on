import { PrismaClient } from '@prisma/client';
import storage from '../storage';

const prisma = new PrismaClient();

// Storage keys are upload ids; anything else in the bucket is left alone.
const UPLOAD_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type SweepOptions = {
  olderThan: Date;
  dryRun: boolean;
  maxDeletes: number;
};

/**
 * Deletes bucket objects older than `olderThan` whose key is an upload id with
 * no Upload row, at most `maxDeletes` attempts. Stateless: a run that dies is
 * redone by the next one. In a dry run `deleted` counts what would be deleted.
 */
export async function deleteBucketOrphans({
  olderThan,
  dryRun,
  maxDeletes,
}: SweepOptions) {
  const result = { found: 0, deleted: 0, errors: 0, capped: false };
  let startAfter: string | undefined;
  let truncated = true;

  while (truncated && !result.capped) {
    const page = await storage.listObjects(startAfter);
    truncated = page.truncated && page.objects.length > 0;
    startAfter = page.objects[page.objects.length - 1]?.key;

    const candidates = page.objects
      .filter((o) => UPLOAD_KEY.test(o.key) && o.lastModified < olderThan)
      .map((o) => o.key);
    if (candidates.length === 0) continue;

    const rows = await prisma.upload.findMany({
      where: { id: { in: candidates } },
      select: { id: true },
    });
    const known = new Set(rows.map(({ id }) => id));

    for (const key of candidates.filter((k) => !known.has(k))) {
      if (result.deleted + result.errors >= maxDeletes) {
        result.capped = true;
        break;
      }
      result.found++;
      if (dryRun) {
        result.deleted++;
        continue;
      }
      try {
        await storage.del(key);
        result.deleted++;
      } catch (e) {
        console.warn(`[orphanSweep] storage.del(${key}) failed`, e);
        result.errors++;
      }
    }
  }

  return result;
}
