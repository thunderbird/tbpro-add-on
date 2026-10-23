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

type PageResult = { scanned: number; cut: boolean; lastKey?: string };

// Acts on one listed page: deletes (or, in a dry run, logs) its orphans within
// what is left of the budget and adds to `totals`.
async function sweepPage(
  objects: BucketObject[],
  cutoff: Date,
  options: BucketPassOptions,
  totals: PassTotals
): Promise<PageResult> {
  const candidates = await findCandidates(objects, cutoff);
  const taken = candidates.slice(0, options.budget - totals.orphans);
  const cut = taken.length < candidates.length;
  // A capped page resumes after the last object acted on.
  const [lastTaken] = taken.slice(-1);
  const scanned = cut
    ? objects.slice(
        0,
        objects.findIndex(({ key }) => key === lastTaken?.key) + 1
      )
    : objects;
  totals.orphans += taken.length;
  totals.kept += scanned.length - taken.length;

  if (options.dryRun) {
    if (taken.length > 0) {
      const keys = taken.map(({ key }) => key).join(', ');
      console.log(
        `[orphanCleanup] dry run: would delete ${taken.length} bucket objects: ${keys}`
      );
    }
  } else {
    const outcomes = await mapLimit(taken, CLEANUP_CONCURRENCY, removeObject);
    totals.deleted += outcomes.filter((o) => o === 'deleted').length;
    totals.kept += outcomes.filter((o) => o === 'kept').length;
    totals.errors += outcomes.filter((o) => o === 'error').length;
  }
  const [lastScanned] = scanned.slice(-1);
  return { scanned: scanned.length, cut, lastKey: lastScanned?.key };
}

type BucketPassResult = PassTotals & { cursor: string | null; capped: boolean };

async function sweepFrom(
  after: string | undefined,
  cutoff: Date,
  options: BucketPassOptions,
  totals: PassTotals
): Promise<BucketPassResult> {
  const { objects, truncated } = await storage.listObjects(
    after,
    BUCKET_PAGE_SIZE
  );
  const page = await sweepPage(objects, cutoff, options, totals);
  const next = page.lastKey ?? after;
  const done = objects.length === 0 || (!truncated && !page.cut);
  const capped = totals.orphans >= options.budget;
  const cursor = done ? null : (next ?? null);
  await options.onPage?.(cursor, totals);
  const outOfTime = Date.now() > (options.deadline ?? Infinity);
  if (capped || done || outOfTime) return { ...totals, cursor, capped };
  return sweepFrom(next, cutoff, options, totals);
}

/**
 * Deletes stored objects that no Upload row or live reservation accounts for
 * and that are older than `minAgeHours`, paging the bucket in key order from
 * `cursor`. Returns the cursor to resume from, or null once the listing ends.
 */
export async function sweepBucket(
  options: BucketPassOptions
): Promise<BucketPassResult> {
  const totals = emptyTotals();
  if (options.budget <= 0) {
    return { ...totals, cursor: options.cursor, capped: true };
  }
  const cutoff = hoursAgo(options.minAgeHours);
  return sweepFrom(options.cursor ?? undefined, cutoff, options, totals);
}
