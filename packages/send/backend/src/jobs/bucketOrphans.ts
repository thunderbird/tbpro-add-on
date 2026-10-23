import { PrismaClient } from '@prisma/client';
import {
  CLEANUP_CONCURRENCY,
  claimBytes,
  hoursAgo,
} from '../models/pendingUploads';
import storage from '../storage';
import { BucketObject } from '../storage/s3b2';
import { mapLimit } from '../utils/mapLimit';
const prisma = new PrismaClient();

export const BUCKET_PAGE_SIZE = 1000;
// Owner of the claim record for bytes no reservation names; matches no user.
const UNKNOWN_OWNER = '00000000-0000-0000-0000-000000000000';
const UPLOAD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The upload id an object is stored for, or null for a key this backend never
 * writes. Every object is keyed by its upload id; a multipart file is one
 * object per part, each with its own id and Upload row.
 */
export function uploadIdForKey(key: string): string | null {
  return UPLOAD_ID.test(key) ? key : null;
}

export type PassTotals = {
  orphans: number;
  deleted: number;
  kept: number;
  errors: number;
};

export function emptyTotals(): PassTotals {
  return { orphans: 0, deleted: 0, kept: 0, errors: 0 };
}

export type BucketPassOptions = {
  cursor: string | null;
  minAgeHours: number;
  dryRun: boolean;
  // Most orphans this pass may act on; it stops there and reports capped.
  budget: number;
  // Stops after the page that passes this time (ms epoch); resumable.
  deadline?: number;
  // Called after each page with where the next sweep should resume.
  onPage?: (cursor: string | null, totals: PassTotals) => Promise<void>;
};

type Candidate = { key: string; id: string };
type Outcome = 'deleted' | 'kept' | 'error';

// Old objects whose id has neither an Upload row nor a live reservation.
async function findCandidates(
  objects: BucketObject[],
  cutoff: Date
): Promise<Candidate[]> {
  const old = objects.flatMap(({ key, lastModified }) => {
    const id = uploadIdForKey(key);
    return id && lastModified < cutoff ? [{ key, id }] : [];
  });
  if (old.length === 0) return [];
  const ids = old.map(({ id }) => id);
  const [uploads, reserved] = await Promise.all([
    prisma.upload.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
    prisma.pendingUpload.findMany({
      where: { id: { in: ids }, sweptAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  ]);
  const known = new Set([...uploads, ...reserved].map(({ id }) => id));
  return old.filter(({ id }) => !known.has(id));
}

function releaseClaim(id: string) {
  return prisma.pendingUpload.deleteMany({
    where: { id, sweptAt: { not: null } },
  });
}

// Same order as the reservation sweep: claim, then look for the Upload row, so
// a finalize either holds the bytes first or is refused afterwards.
async function removeObject({ key, id }: Candidate): Promise<Outcome> {
  try {
    if (!(await claimBytes(prisma, id, UNKNOWN_OWNER))) return 'kept';
    if ((await prisma.upload.count({ where: { id } })) > 0) {
      await releaseClaim(id);
      return 'kept';
    }
    // A failed delete keeps the claim; the reservation sweep retries it.
    await storage.del(key);
    await releaseClaim(id);
    return 'deleted';
  } catch (e) {
    console.warn(`[orphanCleanup] could not delete bucket object ${key}`, e);
    return 'error';
  }
}

/**
 * Deletes stored objects that no Upload row or reservation accounts for and
 * that are older than `minAgeHours`, paging the bucket in key order from
 * `cursor`. Returns the cursor to resume from, or null once the listing ends.
 */
export async function sweepBucket({
  cursor,
  minAgeHours,
  dryRun,
  budget,
  deadline = Infinity,
  onPage,
}: BucketPassOptions): Promise<
  PassTotals & { cursor: string | null; capped: boolean }
> {
  const totals = emptyTotals();
  if (budget <= 0) return { ...totals, cursor, capped: true };
  const cutoff = hoursAgo(minAgeHours);
  let next = cursor ?? undefined;
  for (;;) {
    const { objects, truncated } = await storage.listObjects(
      next,
      BUCKET_PAGE_SIZE
    );
    const candidates = await findCandidates(objects, cutoff);
    const taken = candidates.slice(0, budget - totals.orphans);
    const cut = taken.length < candidates.length;
    // A capped page resumes after the last object acted on.
    const lastKey = taken.length > 0 ? taken[taken.length - 1].key : null;
    const scanned = cut
      ? objects.slice(0, objects.findIndex(({ key }) => key === lastKey) + 1)
      : objects;
    totals.orphans += taken.length;
    totals.kept += scanned.length - taken.length;

    if (dryRun) {
      if (taken.length > 0) {
        const keys = taken.map(({ key }) => key).join(', ');
        console.log(
          `[orphanCleanup] dry run: would delete ${taken.length} bucket objects: ${keys}`
        );
      }
    } else {
      const outcomes = await mapLimit(taken, CLEANUP_CONCURRENCY, removeObject);
      for (const outcome of outcomes) {
        if (outcome === 'deleted') totals.deleted++;
        else if (outcome === 'kept') totals.kept++;
        else totals.errors++;
      }
    }

    if (scanned.length > 0) next = scanned[scanned.length - 1].key;
    const done = objects.length === 0 || (!truncated && !cut);
    const capped = totals.orphans >= budget;
    const resumeAt = done ? null : (next ?? null);
    await onPage?.(resumeAt, totals);
    if (capped || done || Date.now() > deadline) {
      return { ...totals, cursor: resumeAt, capped };
    }
  }
}
