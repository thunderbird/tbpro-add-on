import { Prisma, PrismaClient } from '@prisma/client';
import { hostname } from 'node:os';
import { deleteOrphans } from '../models';
import {
  CLEANUP_BATCH_SIZE,
  getOrphanMinAgeHours,
  sweepExpiredPendingUploads,
} from '../models/pendingUploads';
import { emptyTotals, PassTotals, sweepBucket } from './bucketOrphans';
const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;
// Fixed key ('SENDSWEP') for the sweep's leader lock.
export const SWEEP_LOCK_KEY = 0x53454e4453574550n;
// An unfinished sweep older than this crashed; the next one takes it over.
export const STALE_SWEEP_HOURS = 6;
// The bucket pass stops in time to finish before a sweep counts as stale.
const SWEEP_BUDGET_MS = 5 * HOUR_MS;
const MAX_JITTER_MS = 10 * 60 * 1000;
const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_MAX_DELETES = 10_000;

export const INSTANCE_ID = `${hostname()}:${process.pid}`;

export type SweepSummary = {
  sweepId: number;
  instanceId: string;
  rowOrphans: number;
  bucketOrphans: number;
  deleted: number;
  kept: number;
  errors: number;
  durationMs: number;
  dryRun: boolean;
  capped: boolean;
};

export type SweepResult =
  | ({ status: 'completed' } & SweepSummary)
  | { status: 'skipped'; reason: string };

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Hours between sweeps: ORPHAN_CLEANUP_INTERVAL_HOURS, 24 unset, 0 off. */
export function getIntervalHours(): number {
  const raw = process.env.ORPHAN_CLEANUP_INTERVAL_HOURS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_INTERVAL_HOURS;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error(
      `ORPHAN_CLEANUP_INTERVAL_HOURS must be a number of hours >= 0, got '${raw}'`
    );
  }
  return hours;
}

function sweepConfig() {
  return {
    minAgeHours: getOrphanMinAgeHours(),
    dryRun: process.env.ORPHAN_CLEANUP_DRY_RUN === 'true',
    maxDeletes: positiveIntFromEnv(
      'ORPHAN_CLEANUP_MAX_DELETES',
      DEFAULT_MAX_DELETES
    ),
  };
}

// The bucket cursor of the last sweep in the same mode: a dry run's progress
// must not make a real sweep skip objects it only logged.
async function resumeCursor(dryRun: boolean): Promise<string | null> {
  const last = await prisma.storageSweep.findFirst({
    where: { dryRun },
    orderBy: { startedAt: 'desc' },
  });
  return last?.cursor ?? null;
}

// Why this instance must not start a sweep now, or the cursor to resume from.
async function claimTurn(
  force: boolean,
  dryRun: boolean
): Promise<{ skip: string } | { cursor: string | null }> {
  const latest = await prisma.storageSweep.findFirst({
    orderBy: { startedAt: 'desc' },
  });
  if (!latest) return { cursor: null };
  if (latest.finishedAt === null) {
    const staleAt = Date.now() - STALE_SWEEP_HOURS * HOUR_MS;
    if (latest.startedAt.getTime() > staleAt) {
      return { skip: `sweep ${latest.id} is still running` };
    }
    await prisma.storageSweep.update({
      where: { id: latest.id },
      data: { finishedAt: new Date(), error: 'abandoned; taken over' },
    });
    return { cursor: await resumeCursor(dryRun) };
  }
  const gapMs = Math.max(getIntervalHours() - 1, 0) * HOUR_MS;
  if (!force && latest.finishedAt.getTime() > Date.now() - gapMs) {
    return { skip: `sweep ${latest.id} finished recently` };
  }
  return { cursor: await resumeCursor(dryRun) };
}

type RowPassStep = (
  minAgeHours: number,
  options: { limit: number; dryRun: boolean; after?: string }
) => Promise<{
  found: number;
  deleted: number;
  errors: number;
  lastId?: string;
}>;

const orphanRowsStep: RowPassStep = async (minAgeHours, options) => {
  const r = await deleteOrphans(minAgeHours, options);
  return {
    found: r.found,
    lastId: r.lastId,
    deleted: r.deletedUploadIds.length,
    errors: r.errorUploadIds.length,
  };
};

const expiredReservationsStep: RowPassStep = async (minAgeHours, options) => {
  const r = await sweepExpiredPendingUploads(minAgeHours, options);
  return {
    found: r.found,
    lastId: r.lastId,
    deleted: r.deletedIds.length,
    errors: r.errorIds.length,
  };
};

type RowPassContext = {
  budget: number;
  minAgeHours: number;
  dryRun: boolean;
  keepAlive: () => Promise<unknown>;
};

// Runs one step batch by batch until it runs dry, stops making progress, or
// the budget is spent. A dry run pages by id, since it deletes nothing.
async function runStep(
  step: RowPassStep,
  ctx: RowPassContext,
  totals: PassTotals,
  after?: string
): Promise<void> {
  const limit = Math.min(ctx.budget - totals.orphans, CLEANUP_BATCH_SIZE);
  if (limit <= 0) return;
  const r = await step(ctx.minAgeHours, { limit, dryRun: ctx.dryRun, after });
  await ctx.keepAlive();
  totals.orphans += r.found;
  totals.deleted += r.deleted;
  totals.errors += r.errors;
  totals.kept += ctx.dryRun ? 0 : r.found - r.deleted - r.errors;
  const more = r.found === limit && (ctx.dryRun || r.deleted > 0);
  if (more) await runStep(step, ctx, totals, ctx.dryRun ? r.lastId : undefined);
}

// Item-less Upload rows, then expired reservations: in turn, sharing the budget.
async function rowPass(ctx: RowPassContext): Promise<PassTotals> {
  const totals = emptyTotals();
  await runStep(orphanRowsStep, ctx, totals);
  await runStep(expiredReservationsStep, ctx, totals);
  return totals;
}

async function sweep(
  lock: Prisma.TransactionClient,
  cursor: string | null
): Promise<SweepSummary> {
  const { minAgeHours, dryRun, maxDeletes } = sweepConfig();
  const started = Date.now();
  const row = await prisma.storageSweep.create({
    data: { instanceId: INSTANCE_ID, cursor, dryRun },
  });
  // Each step touches the lock's transaction so it is never idle for long.
  const keepAlive = () => lock.$queryRaw`SELECT 1`;
  const summary: SweepSummary = {
    sweepId: row.id,
    instanceId: INSTANCE_ID,
    rowOrphans: 0,
    bucketOrphans: 0,
    deleted: 0,
    kept: 0,
    errors: 0,
    durationMs: 0,
    dryRun,
    capped: false,
  };
  const save = (data: Prisma.StorageSweepUpdateInput) =>
    prisma.storageSweep.update({ where: { id: row.id }, data });
  try {
    const rows = await rowPass({
      budget: maxDeletes,
      minAgeHours,
      dryRun,
      keepAlive,
    });
    const bucket = await sweepBucket({
      cursor,
      minAgeHours,
      dryRun,
      budget: maxDeletes - rows.orphans,
      deadline: started + SWEEP_BUDGET_MS,
      onPage: async (next, totals) => {
        await keepAlive();
        await save({ cursor: next, bucketOrphans: totals.orphans });
      },
    });
    Object.assign(summary, {
      rowOrphans: rows.orphans,
      bucketOrphans: bucket.orphans,
      deleted: rows.deleted + bucket.deleted,
      kept: rows.kept + bucket.kept,
      errors: rows.errors + bucket.errors,
      capped: bucket.capped,
    });
    await save({
      finishedAt: new Date(),
      cursor: bucket.cursor,
      ...countersOf(summary),
    });
    return summary;
  } catch (e) {
    await save({
      finishedAt: new Date(),
      error: e instanceof Error ? e.message : String(e),
      ...countersOf(summary),
    }).catch(() => {});
    throw e;
  } finally {
    summary.durationMs = Date.now() - started;
    console.log(`[orphanCleanup] sweep ${JSON.stringify(summary)}`);
  }
}

function countersOf(s: SweepSummary) {
  const { rowOrphans, bucketOrphans, deleted, kept, errors, capped } = s;
  return { rowOrphans, bucketOrphans, deleted, kept, errors, capped };
}

/**
 * Runs one orphaned-storage sweep if this instance wins the leader lock and
 * the schedule says one is due (`force` skips the schedule check, not the
 * lock). The lock is a transaction-scoped advisory lock on a connection held
 * for the whole sweep, so it is released when the sweep ends or the process
 * dies; StorageSweep rows record each run and the bucket cursor.
 */
export function runStorageSweep(force = false): Promise<SweepResult> {
  return prisma.$transaction(
    async (lock) => {
      const [{ locked }] = await lock.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${SWEEP_LOCK_KEY}) AS locked`;
      if (!locked) {
        return skipped('another instance holds the sweep lock');
      }
      const turn = await claimTurn(force, sweepConfig().dryRun);
      if ('skip' in turn) return skipped(turn.skip);
      return { status: 'completed', ...(await sweep(lock, turn.cursor)) };
    },
    { maxWait: 10_000, timeout: STALE_SWEEP_HOURS * HOUR_MS }
  );
}

function skipped(reason: string): SweepResult {
  console.log(`[orphanCleanup] sweep skipped on ${INSTANCE_ID}: ${reason}`);
  return { status: 'skipped', reason };
}

let running: Promise<SweepResult> | null = null;

/** Runs a sweep now; calls overlapping within this process share one run. */
export function runOrphanCleanup(force = false): Promise<SweepResult> {
  running ??= runStorageSweep(force).finally(() => {
    running = null;
  });
  return running;
}

/**
 * Starts the built-in schedule: every ORPHAN_CLEANUP_INTERVAL_HOURS (default
 * 24; 0 turns it off). Each instance checks at most hourly, first after a
 * random 0-10 min, and a sweep starts only where the database says one is due.
 */
export function startOrphanCleanupSchedule(): NodeJS.Timeout | undefined {
  const hours = getIntervalHours();
  if (hours === 0) return undefined;
  const tick = () => {
    if (running !== null) return;
    runOrphanCleanup().catch((e) =>
      console.error('[orphanCleanup] sweep failed', e)
    );
  };
  const checkMs = Math.min(hours, 1) * HOUR_MS;
  const timer = setTimeout(
    () => {
      tick();
      setInterval(tick, checkMs).unref();
    },
    Math.floor(Math.random() * MAX_JITTER_MS)
  );
  timer.unref();
  return timer;
}
