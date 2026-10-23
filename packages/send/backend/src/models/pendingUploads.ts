import { Prisma, PrismaClient } from '@prisma/client';
import storage from '../storage';
import { UPLOAD_URL_TTL_SECONDS } from '../storage/s3b2';
import { mapLimit } from '../utils/mapLimit';
const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_ORPHAN_MIN_AGE_HOURS = 24;
// Per-run cap so one run stays bounded; later runs pick up the rest.
export const CLEANUP_BATCH_SIZE = 1000;
// Rows cleaned up in parallel; small so cleanup leaves the pool to requests.
export const CLEANUP_CONCURRENCY = 5;

/**
 * How old an unfinished upload must be before cleanup may remove it (#117).
 * Keeps in-flight uploads safe: the item is created only after every part is
 * stored. Overridable with ORPHAN_MIN_AGE_HOURS.
 */
export function getOrphanMinAgeHours(): number {
  const hours = Number(process.env.ORPHAN_MIN_AGE_HOURS);
  return Number.isFinite(hours) && hours > 0
    ? hours
    : DEFAULT_ORPHAN_MIN_AGE_HOURS;
}

export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * HOUR_MS);
}

/** Per-run bound on the rows a cleanup step handles, and report-only mode. */
export type CleanupOptions = { limit?: number; dryRun?: boolean };

export function logDryRun(what: string, rows: { id: string }[]) {
  if (rows.length === 0) return;
  const ids = rows.map(({ id }) => id).join(', ');
  console.log(
    `[orphanCleanup] dry run: would delete ${rows.length} ${what}: ${ids}`
  );
}

function urlExpiry(): Date {
  return new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);
}

/**
 * Bytes reserved by the owner's unexpired presigned URLs. `excludeId` leaves
 * out the reservation being finalized, whose bytes the caller adds itself.
 */
export async function getReservedBytes(
  ownerId: string,
  excludeId?: string
): Promise<number> {
  const result = await prisma.pendingUpload.aggregate({
    where: {
      ownerId,
      expiresAt: { gt: new Date() },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    _sum: { size: true },
  });
  return Number(result._sum.size ?? 0);
}

/**
 * Reserves `size` bytes for a presigned upload URL until it is finalized or
 * expires. Returns false, reserving nothing, when that would reach `limit`.
 * The check and the insert hold a per-owner lock, so parallel requests cannot
 * all pass. A legacy request without a size reserves no bytes.
 */
export function reservePendingUpload(
  id: string,
  ownerId: string,
  size: number | undefined,
  limit: number
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;
    if (size) {
      // One statement, one snapshot: a finalize committing meanwhile is counted
      // as its Upload row or as its reservation, never as neither.
      const [{ used }] = await tx.$queryRaw<{ used: bigint }[]>`
        SELECT (
          (SELECT COALESCE(SUM("size"), 0) FROM "Upload"
            WHERE "ownerId" = ${ownerId}::uuid)
          + (SELECT COALESCE(SUM("size"), 0) FROM "PendingUpload"
            WHERE "ownerId" = ${ownerId}::uuid
              AND "expiresAt" > (NOW() AT TIME ZONE 'UTC'))
        )::bigint AS used`;
      if (Number(used) + size >= limit) return false;
    }
    await tx.pendingUpload.create({
      data: { id, ownerId, size: size ?? null, expiresAt: urlExpiry() },
    });
    return true;
  });
}

/**
 * Called before finalizing: pushes the reservation's expiry out so cleanup
 * cannot claim it meanwhile. False when cleanup already claimed it, i.e. its
 * bytes are being deleted. An id with no reservation (minted before
 * reservations existed) is not held and returns true.
 */
export async function holdPendingUpload(id: string): Promise<boolean> {
  const { count } = await prisma.pendingUpload.updateMany({
    where: { id, sweptAt: null },
    data: { expiresAt: urlExpiry() },
  });
  if (count > 0) return true;
  const claimed = await prisma.pendingUpload.count({
    where: { id, sweptAt: { not: null } },
  });
  return claimed === 0;
}

export function clearPendingUploads(ownerId: string, ids: string[]) {
  return prisma.pendingUpload.deleteMany({
    where: { ownerId, id: { in: ids } },
  });
}

/**
 * Releases the reserved bytes of `ids` but keeps (or creates) their records,
 * so the sweep still deletes whatever bytes end up stored without an Upload
 * row, including a PUT that lands later on a URL that is still valid.
 */
export async function releasePendingUploads(ownerId: string, ids: string[]) {
  if (ids.length === 0) return;
  await prisma.pendingUpload.updateMany({
    where: { ownerId, id: { in: ids } },
    data: { size: null },
  });
  const expiresAt = urlExpiry();
  await prisma.pendingUpload.createMany({
    data: ids.map((id) => ({ id, ownerId, expiresAt })),
    skipDuplicates: true,
  });
}

/**
 * Marks the bytes stored under `id` as being deleted, so a finalize arriving
 * later is refused: claims an expired reservation, or records a claimed one.
 * False when a finalize holds an unexpired reservation for the id.
 */
export async function claimBytes(
  db: Prisma.TransactionClient,
  id: string,
  ownerId: string
): Promise<boolean> {
  const sweptAt = new Date();
  const existing = await db.pendingUpload.updateMany({
    where: { id, sweptAt: null, expiresAt: { lt: sweptAt } },
    data: { sweptAt },
  });
  if (existing.count > 0) return true;
  const created = await db.pendingUpload.createMany({
    data: [{ id, ownerId, expiresAt: new Date(0), sweptAt }],
    skipDuplicates: true,
  });
  if (created.count > 0) return true;
  return (await db.pendingUpload.count({ where: { id, sweptAt: null } })) === 0;
}

type SweepOutcome = 'deleted' | 'kept' | 'error';

async function sweepOne(
  { id, ownerId }: { id: string; ownerId: string },
  cutoff: Date
): Promise<SweepOutcome> {
  // Claim, then look for the Upload row: a finalize either held the
  // reservation first (the claim matches nothing) or is refused after it.
  const { count } = await prisma.pendingUpload.updateMany({
    where: { id, expiresAt: { lt: cutoff } },
    data: { sweptAt: new Date() },
  });
  if (count === 0) return 'kept';
  const finalized = (await prisma.upload.count({ where: { id } })) > 0;
  // A failed delete keeps the claimed record, so the next run retries.
  if (!finalized) await storage.del(id);
  await clearPendingUploads(ownerId, [id]);
  return finalized ? 'kept' : 'deleted';
}

/**
 * Removes the storage objects of up to `limit` reservations that expired more
 * than `hoursSinceExpiry` ago without being finalized, then the reservations.
 * A reservation whose Upload row exists only loses the record; its bytes stay.
 * A dry run only reports them.
 */
export async function sweepExpiredPendingUploads(
  hoursSinceExpiry = getOrphanMinAgeHours(),
  { limit = CLEANUP_BATCH_SIZE, dryRun = false }: CleanupOptions = {}
) {
  const cutoff = hoursAgo(hoursSinceExpiry);
  const take = Math.min(limit, CLEANUP_BATCH_SIZE);
  const expired =
    take > 0
      ? await prisma.pendingUpload.findMany({
          where: { expiresAt: { lt: cutoff } },
          select: { id: true, ownerId: true },
          orderBy: { expiresAt: 'asc' },
          take,
        })
      : [];
  if (dryRun) {
    logDryRun('expired reservations', expired);
    return { found: expired.length, deletedIds: [], errorIds: [] };
  }

  const outcomes = await mapLimit(expired, CLEANUP_CONCURRENCY, (row) =>
    sweepOne(row, cutoff).catch((e): SweepOutcome => {
      console.warn(`[sweepExpiredPendingUploads] ${row.id}`, e);
      return 'error';
    })
  );
  const idsWith = (outcome: SweepOutcome) =>
    expired.filter((_, i) => outcomes[i] === outcome).map(({ id }) => id);
  return {
    found: expired.length,
    deletedIds: idsWith('deleted'),
    errorIds: idsWith('error'),
  };
}
