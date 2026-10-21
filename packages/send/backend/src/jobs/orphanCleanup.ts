import { deleteOrphans } from '../models';
import { sweepExpiredPendingUploads } from '../models/pendingUploads';

const HOUR_MS = 60 * 60 * 1000;
// setInterval clamps longer delays to 1 ms.
const MAX_TIMER_MS = 2_147_483_647;

let running: Promise<OrphanCleanupResult> | null = null;

export type OrphanCleanupResult = {
  orphans: Awaited<ReturnType<typeof deleteOrphans>>;
  pending: Awaited<ReturnType<typeof sweepExpiredPendingUploads>>;
};

/**
 * Deletes item-less uploads (rows + bytes) and the bytes of presigned uploads
 * that were never finalized (#117). Every step is idempotent, so overlapping
 * runs on several instances are safe; within one process they are coalesced.
 */
export function runOrphanCleanup(): Promise<OrphanCleanupResult> {
  running ??= (async () => {
    try {
      const orphans = await deleteOrphans();
      const pending = await sweepExpiredPendingUploads();
      return { orphans, pending };
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Runs the cleanup every ORPHAN_CLEANUP_INTERVAL_HOURS. Off when unset, so
 * deployments opt in (or call POST /api/uploads/reconcile from a scheduler).
 * Throws at startup for an interval above the timer limit (~596 hours). A tick
 * that finds the previous run still active is skipped.
 */
export function startOrphanCleanupSchedule(): NodeJS.Timeout | undefined {
  const hours = Number(process.env.ORPHAN_CLEANUP_INTERVAL_HOURS);
  if (!Number.isFinite(hours) || hours <= 0) {
    return undefined;
  }
  const intervalMs = hours * HOUR_MS;
  if (intervalMs > MAX_TIMER_MS) {
    throw new Error(
      `ORPHAN_CLEANUP_INTERVAL_HOURS=${hours} exceeds the maximum of ${Math.floor(MAX_TIMER_MS / HOUR_MS)} hours`
    );
  }
  const timer = setInterval(() => {
    if (running) {
      console.warn('[orphanCleanup] previous run still active; skipping');
      return;
    }
    runOrphanCleanup()
      .then(({ orphans, pending }) =>
        console.log(
          `[orphanCleanup] orphans deleted=${orphans.deletedUploadIds.length} failed=${orphans.errorUploadIds.length}; pending deleted=${pending.deletedIds.length} failed=${pending.errorIds.length}`
        )
      )
      .catch((e) => console.error('[orphanCleanup] failed', e));
  }, intervalMs);
  timer.unref();
  return timer;
}
