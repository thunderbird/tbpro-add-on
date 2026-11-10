import { Prisma, PrismaClient } from '@prisma/client';
import { envNumber } from '../utils/envNumber';

const prisma = new PrismaClient();

// Cleans up shares left behind by file deletions made before deleteItem revoked
// share links (#1393). A share is abandoned once none of its uploads has an
// item in a regular folder. If no link resolves any more, its Group is deleted
// (cascading to the share) and the freed uploads become row orphans. Links that
// still resolve get a sunset expiryDate instead and are reaped by a later run.
// Locked links count as resolving.

export type AbandonedShareSweepOptions = {
  /**
   * Only containers created before this are touched (null counts as old).
   * The earlier of the age guard and ABANDONED_SHARE_CREATED_BEFORE: the
   * sweep exists for shares left behind before deletion revoked them (#1400),
   * and a share whose upload has no regular item can also be one the owner
   * kept on purpose (delete with shouldDeleteContent=false). Those cannot be
   * told apart in the database, so a live run touches nothing created after
   * the fix was deployed.
   */
  olderThan: Date;
  /** Sunset written to links that still resolve; now plus the grace period. */
  graceEnd: Date;
  /** When true, log what would happen and change nothing. */
  dryRun: boolean;
  /** Most containers acted on per run; the rest wait for the next one. */
  maxActions: number;
  /** Epoch ms after which no further work is started. */
  deadline: number;
};

export type AbandonedShareSweepResult = {
  /** Abandoned containers examined. */
  scanned: number;
  /** Containers deleted because no link resolves them any more. */
  reaped: number;
  /** Containers whose links received a sunset expiry this run. */
  graced: number;
  /** Containers already sunset, still inside their grace period. */
  waiting: number;
  errors: number;
  dryRun: boolean;
  capped: boolean;
};

type Db = Pick<Prisma.TransactionClient, 'container'>;
type Link = { expiryDate: Date | null };

const BATCH_SIZE = 200;

/**
 * The single definition of an abandoned share: a share-only container, old
 * enough that no share creation can still be in flight, in which every item's
 * upload has lost all its regular-folder items. The report script and the
 * sweep must agree on this, so both build their queries from here.
 */
export function abandonedShareWhere(
  olderThan: Date,
  afterId?: string
): Prisma.ContainerWhereInput {
  return {
    shareOnly: true,
    OR: [{ createdAt: { lt: olderThan } }, { createdAt: null }],
    items: {
      every: {
        upload: { items: { none: { container: { shareOnly: false } } } },
      },
    },
    ...(afterId && { id: { gt: afterId } }),
  };
}

export type ShareAction = 'reap' | 'sunset' | 'wait';

/**
 * What the sweep does with an abandoned container, from its links: reap it
 * when none resolves any more, sunset the links that would outlive graceEnd,
 * otherwise wait for a sunset already written. The report script prints the
 * same decision, so both call this.
 */
export function decideAction<L extends Link>(
  links: L[],
  now: Date,
  graceEnd: Date
): { action: ShareAction; needsSunset: L[] } {
  const resolving = links.filter(
    ({ expiryDate }) => expiryDate === null || expiryDate > now
  );
  const needsSunset = resolving.filter(
    ({ expiryDate }) => expiryDate === null || expiryDate > graceEnd
  );
  if (resolving.length === 0) return { action: 'reap', needsSunset };
  return { action: needsSunset.length > 0 ? 'sunset' : 'wait', needsSunset };
}

type Batch = Prisma.ContainerGetPayload<{
  select: {
    id: true;
    ownerId: true;
    groupId: true;
    _count: { select: { items: true } };
    shares: {
      select: { accessLinks: { select: { id: true; expiryDate: true } } };
    };
  };
}>[];

const COUNTER: Record<ShareAction, 'reaped' | 'graced' | 'waiting'> = {
  reap: 'reaped',
  sunset: 'graced',
  wait: 'waiting',
};

/**
 * Deletes the container's Group only if nobody gave it a resolving link since
 * the batch was read. The container row is locked first: a concurrent
 * `POST /sharing` inserts rows that reference it, which waits on that lock,
 * so the re-read below sees every link that exists at commit time.
 */
async function reapIfStillAbandoned(
  containerId: string,
  now: Date,
  options: AbandonedShareSweepOptions
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Container" WHERE id = ${containerId}::uuid FOR UPDATE`;
    const current = await tx.container.findFirst({
      where: { id: containerId, ...abandonedShareWhere(options.olderThan) },
      select: {
        groupId: true,
        shares: {
          select: { accessLinks: { select: { id: true, expiryDate: true } } },
        },
      },
    });
    if (!current) return false;
    const links = current.shares.flatMap(({ accessLinks }) => accessLinks);
    if (decideAction(links, now, options.graceEnd).action !== 'reap') {
      return false;
    }
    await tx.group.delete({ where: { id: current.groupId } });
    return true;
  });
}

/** Applies the decision for one abandoned container. */
async function processContainer(
  container: Batch[number],
  options: AbandonedShareSweepOptions,
  now: Date
): Promise<ShareAction> {
  const links = container.shares.flatMap(({ accessLinks }) => accessLinks);
  const { action, needsSunset } = decideAction(links, now, options.graceEnd);
  if (action === 'wait') return action;

  if (!options.dryRun && action === 'reap') {
    const reaped = await reapIfStillAbandoned(container.id, now, options);
    if (!reaped) return 'wait';
  }
  if (!options.dryRun && action === 'sunset') {
    await prisma.accessLink.updateMany({
      where: { id: { in: needsSunset.map(({ id }) => id) } },
      data: { expiryDate: options.graceEnd },
    });
  }
  const verb =
    action === 'reap'
      ? `${options.dryRun ? 'would reap' : 'reaped'}`
      : `${options.dryRun ? 'would sunset' : 'sunset'} ${needsSunset.length} links of`;
  console.log(
    `[abandonedShareSweep] ${verb} container ${container.id} ` +
      `(owner ${container.ownerId}, ${container._count.items} items, ${links.length} links)`
  );
  return action;
}

/**
 * Reads go through `db` (the orphan sweep's lock transaction); writes commit on
 * this module's own connection, as in deleteOrphans. Otherwise the row pass's
 * upload deletes would block on this pass's uncommitted item deletes until the
 * lock's transaction times out, and one failed write would abort it.
 */
export async function sweepAbandonedShares(
  options: AbandonedShareSweepOptions,
  db: Db = prisma
): Promise<AbandonedShareSweepResult> {
  const result: AbandonedShareSweepResult = {
    scanned: 0,
    reaped: 0,
    graced: 0,
    waiting: 0,
    errors: 0,
    dryRun: options.dryRun,
    capped: false,
  };
  const now = new Date();
  let afterId: string | undefined;

  // Keyset pagination: reaped rows vanish mid-run, so a cursor row may no
  // longer exist; `id > afterId` is immune to that.
  for (;;) {
    const batch: Batch = await db.container.findMany({
      where: abandonedShareWhere(options.olderThan, afterId),
      select: {
        id: true,
        ownerId: true,
        groupId: true,
        _count: { select: { items: true } },
        shares: {
          select: { accessLinks: { select: { id: true, expiryDate: true } } },
        },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    for (const container of batch) {
      const actions = result.reaped + result.graced + result.errors;
      if (actions >= options.maxActions || Date.now() > options.deadline) {
        result.capped = true;
        return result;
      }
      result.scanned++;
      try {
        result[COUNTER[await processContainer(container, options, now)]]++;
      } catch (e) {
        console.warn(
          `[abandonedShareSweep] failed on container ${container.id}`,
          e
        );
        result.errors++;
      }
    }

    if (batch.length < BATCH_SIZE) {
      return result;
    }
    afterId = batch[batch.length - 1].id;
  }
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Matches the orphan sweep: work stops before the leader lock's transaction
// times out.
const SWEEP_DEADLINE_MS = 1.5 * HOUR_MS;

/** Parsed ABANDONED_SHARE_CREATED_BEFORE, or null when unset or invalid. */
function createdBeforeFromEnv(): Date | null {
  const raw = process.env.ABANDONED_SHARE_CREATED_BEFORE?.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    console.warn(
      `[abandonedShareSweep] ABANDONED_SHARE_CREATED_BEFORE is not a date: ${raw}`
    );
    return null;
  }
  return parsed;
}

export function abandonedShareSweepOptionsFromEnv(
  now = Date.now()
): AbandonedShareSweepOptions {
  const minAgeHours = envNumber('ABANDONED_SHARE_MIN_AGE_HOURS', 24);
  const graceDays = envNumber('ABANDONED_SHARE_GRACE_DAYS', 180);
  const createdBefore = createdBeforeFromEnv();
  const ageGuard = now - minAgeHours * HOUR_MS;
  // Dry run unless explicitly set to false: a deploy without the variable
  // changes nothing. A live run also needs the creation cutoff (see
  // AbandonedShareSweepOptions.olderThan); without it the run stays dry.
  let dryRun =
    process.env.ABANDONED_SHARE_SWEEP_DRY_RUN?.trim().toLowerCase() !== 'false';
  if (!dryRun && !createdBefore) {
    console.warn(
      '[abandonedShareSweep] live run needs ABANDONED_SHARE_CREATED_BEFORE (deploy time of the deletion fix); running dry'
    );
    dryRun = true;
  }
  return {
    olderThan: new Date(
      createdBefore ? Math.min(ageGuard, createdBefore.getTime()) : ageGuard
    ),
    graceEnd: new Date(now + graceDays * DAY_MS),
    dryRun,
    maxActions: Math.floor(
      envNumber('ABANDONED_SHARE_SWEEP_MAX_ACTIONS', 1000)
    ),
    deadline: now + SWEEP_DEADLINE_MS,
  };
}
