import { PrismaClient } from '@prisma/client';
import storage from '../storage';
import { UPLOAD_URL_TTL_SECONDS } from '../storage/s3b2';
const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_ORPHAN_MIN_AGE_HOURS = 24;
// Per-run cap so one run stays bounded; later runs pick up the rest.
export const CLEANUP_BATCH_SIZE = 1000;

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

/**
 * Records a presigned upload URL as reserved storage until it is finalized
 * (POST /uploads) or its URL expires. `size` is absent on the legacy no-size
 * signed-URL path, which reserves nothing.
 */
export function reservePendingUpload(
  id: string,
  ownerId: string,
  size?: number
) {
  const now = Date.now();
  return prisma.pendingUpload.create({
    data: {
      id,
      ownerId,
      size: size ?? null,
      createdAt: new Date(now),
      expiresAt: new Date(now + UPLOAD_URL_TTL_SECONDS * 1000),
    },
  });
}

export function clearPendingUploads(ownerId: string, ids: string[]) {
  return prisma.pendingUpload.deleteMany({
    where: { ownerId, id: { in: ids } },
  });
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
 * Ends reservations now and hands their storage keys to the next sweep, which
 * deletes any bytes left without an Upload row (e.g. after a failed delete).
 */
export async function expirePendingUploads(ownerId: string, ids: string[]) {
  if (ids.length === 0) return;
  const expiresAt = new Date(0);
  await prisma.pendingUpload.updateMany({
    where: { ownerId, id: { in: ids } },
    data: { expiresAt },
  });
  await prisma.pendingUpload.createMany({
    data: ids.map((id) => ({ id, ownerId, expiresAt })),
    skipDuplicates: true,
  });
}

/**
 * Removes the storage objects of reservations that expired more than
 * `hoursSinceExpiry` ago without being finalized, then the reservations.
 * A reservation whose Upload row exists only loses the row; its bytes are kept.
 */
export async function sweepExpiredPendingUploads(
  hoursSinceExpiry = getOrphanMinAgeHours()
) {
  const deletedIds: string[] = [];
  const errorIds: string[] = [];

  const expired = await prisma.pendingUpload.findMany({
    where: { expiresAt: { lt: hoursAgo(hoursSinceExpiry) } },
    select: { id: true, ownerId: true },
    orderBy: { expiresAt: 'asc' },
    take: CLEANUP_BATCH_SIZE,
  });
  if (expired.length === 0) {
    return { deletedIds, errorIds };
  }

  const finalized = await prisma.upload.findMany({
    where: { id: { in: expired.map(({ id }) => id) } },
    select: { id: true },
  });
  const hasUploadRow = new Set(finalized.map(({ id }) => id));

  for (const { id, ownerId } of expired) {
    if (!hasUploadRow.has(id)) {
      try {
        await storage.del(id);
        deletedIds.push(id);
      } catch (e) {
        // Keep the reservation so the next run retries.
        console.error(`[sweepExpiredPendingUploads] storage.del(${id})`, e);
        errorIds.push(id);
        continue;
      }
    }
    await clearPendingUploads(ownerId, [id]);
  }

  return { deletedIds, errorIds };
}
