import { Prisma, PrismaClient } from '@prisma/client';
import { deleteOrphans } from '../models';
import storage from '../storage';
import { STORAGE_DELETE_CONCURRENCY, mapLimit } from '../utils/mapLimit';

const prisma = new PrismaClient();

// Storage keys are upload ids; anything else in the bucket is left alone.
const UPLOAD_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type SweepOptions = {
  olderThan: Date;
  maxDeletes: number;
  /** Epoch ms after which no further work is started. */
  deadline: number;
};

type Db = Pick<Prisma.TransactionClient, 'upload'>;
type BucketResult = {
  found: number;
  deleted: number;
  errors: number;
  capped: boolean;
};

/**
 * Deletes bucket objects older than `olderThan` whose key is an upload id with
 * no Upload row, at most `maxDeletes` attempts. Stateless: a run that dies is
 * redone by the next one.
 */
export async function deleteBucketOrphans(
  options: SweepOptions,
  db: Db = prisma
): Promise<BucketResult> {
  const result = { found: 0, deleted: 0, errors: 0, capped: false };
  await sweepBucketFrom(undefined, options, db, result);
  return result;
}

async function sweepBucketFrom(
  cursor: string | undefined,
  options: SweepOptions,
  db: Db,
  result: BucketResult
): Promise<void> {
  if (Date.now() > options.deadline) {
    result.capped = true;
    return;
  }
  const page = await storage.listObjects(cursor);
  const candidates = page.objects
    .filter((o) => UPLOAD_KEY.test(o.key) && o.lastModified < options.olderThan)
    .map((o) => o.key);
  const rows = candidates.length
    ? await db.upload.findMany({
        where: { id: { in: candidates } },
        select: { id: true },
      })
    : [];
  const known = new Set(rows.map(({ id }) => id));
  const orphans = candidates.filter((key) => !known.has(key));

  const room = Math.max(0, options.maxDeletes - result.deleted - result.errors);
  result.found += orphans.length;
  result.capped = orphans.length > room;
  await mapLimit(orphans.slice(0, room), STORAGE_DELETE_CONCURRENCY, (key) =>
    deleteKey(key, result)
  );

  if (page.next !== undefined && !result.capped) {
    return sweepBucketFrom(page.next, options, db, result);
  }
}

async function deleteKey(key: string, result: BucketResult) {
  try {
    await storage.del(key);
    result.deleted++;
  } catch (e) {
    console.warn(`[orphanSweep] storage.del(${key}) failed`, e);
    result.errors++;
  }
}

const HOUR_MS = 60 * 60 * 1000;
const MAX_JITTER_MS = 10 * 60 * 1000;
const MAX_TIMER_MS = 2 ** 31 - 1;
// The lock's transaction times out after SWEEP_TIMEOUT_MS; work stops earlier.
const SWEEP_DEADLINE_MS = 1.5 * HOUR_MS;
const SWEEP_TIMEOUT_MS = 2 * HOUR_MS;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isFinite(value) && value >= 0) return value;
  console.warn(`[orphanSweep] ignoring ${name}=${raw}, using ${fallback}`);
  return fallback;
}

export function sweepOptionsFromEnv(now = Date.now()): SweepOptions {
  const minAgeHours = envNumber('ORPHAN_MIN_AGE_HOURS', 24);
  return {
    olderThan: new Date(now - minAgeHours * HOUR_MS),
    maxDeletes: Math.floor(envNumber('ORPHAN_SWEEP_MAX_DELETES', 10000)),
    deadline: now + SWEEP_DEADLINE_MS,
  };
}

/** Row pass, then bucket pass with what is left of the delete budget. */
export async function runSweep(
  options = sweepOptionsFromEnv(),
  db: Db = prisma
) {
  const started = Date.now();
  const rows = await deleteOrphans(options, db);
  const budget = options.maxDeletes - rows.deleted - rows.errors;
  const bucket = await deleteBucketOrphans(
    { ...options, maxDeletes: Math.max(0, budget) },
    db
  );
  const summary = {
    rowOrphans: rows.found,
    bucketOrphans: bucket.found,
    deleted: rows.deleted + bucket.deleted,
    errors: rows.errors + bucket.errors,
    durationMs: Date.now() - started,
    capped: rows.capped || bucket.capped,
  };
  console.log(`[orphanSweep] sweep ${JSON.stringify(summary)}`);
  return summary;
}

/**
 * Runs the sweep on whichever instance takes the transaction-scoped advisory
 * lock; the others skip. The lock is released when the transaction ends, so a
 * crashed instance never holds it and it is safe behind pgbouncer. Both passes
 * read through `tx`, so a sweep stops if the lock's connection is lost.
 */
export function runSweepIfLeader() {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(726160117) AS locked`;
      if (!locked) {
        console.log('[orphanSweep] skipped: another instance is sweeping');
        return 'skipped' as const;
      }
      return runSweep(sweepOptionsFromEnv(), tx);
    },
    { maxWait: 60_000, timeout: SWEEP_TIMEOUT_MS }
  );
}

/**
 * Sweeps every ORPHAN_SWEEP_INTERVAL_HOURS (default 24; 0 disables), first
 * after a random delay of up to 10 minutes. Returns whether it was started.
 */
export function startOrphanSweepSchedule(): boolean {
  const intervalHours = envNumber('ORPHAN_SWEEP_INTERVAL_HOURS', 24);
  if (intervalHours <= 0) return false;

  const tick = () =>
    runSweepIfLeader().catch((e) =>
      console.error('[orphanSweep] sweep failed', e)
    );
  setTimeout(() => {
    void tick();
    setInterval(tick, Math.min(intervalHours * HOUR_MS, MAX_TIMER_MS)).unref();
  }, Math.random() * MAX_JITTER_MS).unref();
  return true;
}
