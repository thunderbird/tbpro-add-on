import { PrismaClient } from '@prisma/client';
import { deleteOrphans } from '../models';
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
      result.found++;
      if (result.deleted + result.errors >= maxDeletes) {
        result.capped = true;
        continue;
      }
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

const HOUR_MS = 60 * 60 * 1000;
const MAX_JITTER_MS = 10 * 60 * 1000;
// Upper bound on one sweep; the advisory lock is held for its duration.
const SWEEP_TIMEOUT_MS = 2 * HOUR_MS;

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return process.env[name]?.trim() && Number.isFinite(value) ? value : fallback;
}

export function sweepOptionsFromEnv(now = new Date()): SweepOptions {
  const minAgeHours = envNumber('ORPHAN_MIN_AGE_HOURS', 24);
  return {
    olderThan: new Date(now.getTime() - minAgeHours * HOUR_MS),
    dryRun: process.env.ORPHAN_SWEEP_DRY_RUN === 'true',
    maxDeletes: envNumber('ORPHAN_SWEEP_MAX_DELETES', 10000),
  };
}

/** Row pass, then bucket pass with what is left of the delete budget. */
export async function runSweep(options = sweepOptionsFromEnv()) {
  const started = Date.now();
  const rows = await deleteOrphans(options);
  const budget = options.maxDeletes - rows.deleted - rows.errors;
  const bucket = await deleteBucketOrphans({
    ...options,
    maxDeletes: Math.max(0, budget),
  });
  const summary = {
    rowOrphans: rows.found,
    bucketOrphans: bucket.found,
    deleted: rows.deleted + bucket.deleted,
    errors: rows.errors + bucket.errors,
    durationMs: Date.now() - started,
    dryRun: options.dryRun,
    capped: rows.capped || bucket.capped,
  };
  console.log(`[orphanSweep] sweep ${JSON.stringify(summary)}`);
  return summary;
}

/**
 * Runs the sweep on whichever instance takes the transaction-scoped advisory
 * lock; the others skip. The lock is released when the transaction ends, so a
 * crashed instance never holds it and it is safe behind pgbouncer.
 */
export async function runSweepIfLeader() {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(726160117) AS locked`;
      if (!locked) {
        console.log('[orphanSweep] skipped: another instance is sweeping');
        return 'skipped' as const;
      }
      return runSweep();
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
    setInterval(tick, intervalHours * HOUR_MS).unref();
  }, Math.random() * MAX_JITTER_MS).unref();
  return true;
}
