import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Server-side retry counting and the locked/expired rule shared by every path
// that releases an access link's challenge, key or container (#1006, #1010).

const h = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    accessLink: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () {
    return h.prisma;
  }),
  ContainerType: { CONVERSATION: 'CONVERSATION', FOLDER: 'FOLDER' },
  ItemType: { FILE: 'FILE', MESSAGE: 'MESSAGE' },
  UserTier: { FREE: 'FREE', PRO: 'PRO', EPHEMERAL: 'EPHEMERAL' },
}));

vi.mock('../../storage', () => ({
  default: {},
}));

import { MAX_ACCESS_LINK_RETRIES } from '../../config';
import {
  acceptAccessLink,
  getAccessLinkChallenge,
  getContainerForAccessLink,
  isAccessLinkValid,
  usableAccessLinkWhere,
} from '../../models/sharing';
import { captureConsole } from '../testutils';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const USABLE = {
  locked: false,
  OR: [{ expiryDate: null }, { expiryDate: { gt: NOW } }],
};
const ANSWER = 'challenge-plaintext';

// The row the counting update returns: retryCount already includes this attempt.
const linkAfterAttempt = (retryCount: number) => ({
  id: 'link-1',
  challengePlaintext: ANSWER,
  wrappedKey: 'wrapped',
  salt: 'salt',
  retryCount,
  locked: false,
  share: { containerId: 'container-1' },
});

const updateCalls = () =>
  h.prisma.accessLink.update.mock.calls.map((c) => c[0]);
const updateManyCalls = () =>
  h.prisma.accessLink.updateMany.mock.calls.map((c) => c[0]);

describe('access-link lockout and validity', () => {
  let consoleCapture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.$transaction.mockImplementation((fn) => fn(h.prisma));
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleCapture = captureConsole();
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleCapture.restore();
  });

  it('usableAccessLinkWhere excludes locked and expired links', () => {
    expect(usableAccessLinkWhere()).toEqual(USABLE);
  });

  describe('acceptAccessLink', () => {
    it('counts the attempt on a usable link only, inside a transaction', async () => {
      h.prisma.accessLink.update.mockResolvedValueOnce(linkAfterAttempt(1));
      h.prisma.accessLink.updateMany.mockResolvedValue({ count: 1 });

      await acceptAccessLink('link-1', ANSWER);

      expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(updateCalls()[0]).toMatchObject({
        where: { id: 'link-1', ...USABLE },
        data: { retryCount: { increment: 1 } },
      });
    });

    it('resets the count of an unlocked link and returns it on a correct answer', async () => {
      h.prisma.accessLink.update.mockResolvedValueOnce(
        linkAfterAttempt(MAX_ACCESS_LINK_RETRIES)
      );
      h.prisma.accessLink.updateMany.mockResolvedValue({ count: 1 });

      const link = await acceptAccessLink('link-1', ANSWER);

      expect(link).toMatchObject({
        wrappedKey: 'wrapped',
        salt: 'salt',
        share: { containerId: 'container-1' },
      });
      expect(updateManyCalls()).toEqual([
        { where: { id: 'link-1', locked: false }, data: { retryCount: 0 } },
      ]);
    });

    it('refuses a correct answer when the link was locked meanwhile', async () => {
      h.prisma.accessLink.update.mockResolvedValueOnce(linkAfterAttempt(4));
      h.prisma.accessLink.updateMany.mockResolvedValue({ count: 0 });

      await expect(acceptAccessLink('link-1', ANSWER)).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
    });

    it('refuses a wrong answer below the limit without locking', async () => {
      h.prisma.accessLink.update.mockResolvedValueOnce(
        linkAfterAttempt(MAX_ACCESS_LINK_RETRIES - 1)
      );

      await expect(acceptAccessLink('link-1', 'wrong')).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
      expect(updateManyCalls()).toHaveLength(0);
    });

    it('locks the link on the wrong answer that reaches the limit', async () => {
      h.prisma.accessLink.update.mockResolvedValueOnce(
        linkAfterAttempt(MAX_ACCESS_LINK_RETRIES)
      );
      h.prisma.accessLink.updateMany.mockResolvedValue({ count: 1 });

      await expect(acceptAccessLink('link-1', 'wrong')).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
      expect(updateManyCalls()).toEqual([
        {
          where: {
            id: 'link-1',
            retryCount: { gte: MAX_ACCESS_LINK_RETRIES },
          },
          data: { locked: true },
        },
      ]);
    });

    it('refuses even a correct answer once concurrent attempts passed the limit', async () => {
      h.prisma.accessLink.update.mockResolvedValueOnce(
        linkAfterAttempt(MAX_ACCESS_LINK_RETRIES + 1)
      );
      h.prisma.accessLink.updateMany.mockResolvedValue({ count: 1 });

      await expect(acceptAccessLink('link-1', ANSWER)).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
      expect(updateManyCalls()).toHaveLength(1);
      expect(updateManyCalls()[0]).toMatchObject({ data: { locked: true } });
    });

    it('treats a non-string answer as wrong', async () => {
      h.prisma.accessLink.update.mockResolvedValueOnce(linkAfterAttempt(1));

      await expect(
        acceptAccessLink('link-1', { not: ANSWER } as unknown)
      ).rejects.toThrow('ACCESSLINK_NOT_FOUND');
      expect(updateManyCalls()).toHaveLength(0);
    });

    it('counts an empty answer and locks on the one that reaches the limit', async () => {
      // Clients post an empty answer when the password fails locally.
      h.prisma.accessLink.update.mockResolvedValueOnce(
        linkAfterAttempt(MAX_ACCESS_LINK_RETRIES)
      );
      h.prisma.accessLink.updateMany.mockResolvedValue({ count: 1 });

      await expect(acceptAccessLink('link-1', '')).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
      expect(updateCalls()[0]).toMatchObject({
        data: { retryCount: { increment: 1 } },
      });
      expect(updateManyCalls()).toEqual([
        {
          where: {
            id: 'link-1',
            retryCount: { gte: MAX_ACCESS_LINK_RETRIES },
          },
          data: { locked: true },
        },
      ]);
    });

    it('refuses a locked or expired link without counting', async () => {
      // The usable-link filter matches no row, so the update throws.
      h.prisma.accessLink.update.mockRejectedValueOnce(
        new Error('NotFoundError')
      );

      await expect(acceptAccessLink('link-1', ANSWER)).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
      expect(updateCalls()).toHaveLength(1);
      expect(updateManyCalls()).toHaveLength(0);
    });

    describe('write guards', () => {
      // Each guard on its own; the database-backed overlap test lives in
      // access-link-lockout.integration.ts. The second request's last write
      // is held back until the first request has finished.
      type Where = {
        locked?: boolean;
        retryCount?: { gte: number };
      };
      let row: { retryCount: number; locked: boolean };
      const matches = (where: Where) =>
        (where.locked === undefined || row.locked === where.locked) &&
        (where.retryCount === undefined ||
          row.retryCount >= where.retryCount.gte);

      const fakeTx = (gate?: Promise<void>) => ({
        accessLink: {
          update: vi.fn(async ({ where, data }) => {
            if (!matches(where)) throw new Error('NotFoundError');
            row.retryCount += data.retryCount.increment;
            return { ...linkAfterAttempt(row.retryCount), ...row };
          }),
          updateMany: vi.fn(async ({ where, data }) => {
            await gate;
            if (!matches(where)) return { count: 0 };
            Object.assign(row, data);
            return { count: 1 };
          }),
        },
      });

      const run = async (correctWritesLast: boolean) => {
        row = { retryCount: MAX_ACCESS_LINK_RETRIES - 2, locked: false };
        let releaseLate!: () => void;
        const late = new Promise<void>((r) => (releaseLate = r));
        const txs = correctWritesLast
          ? [fakeTx(late), fakeTx()]
          : [fakeTx(), fakeTx(late)];
        h.prisma.$transaction
          .mockImplementationOnce((fn) => fn(txs[0]))
          .mockImplementationOnce((fn) => fn(txs[1]));

        const correct = acceptAccessLink('link-1', ANSWER);
        const wrong = acceptAccessLink('link-1', 'wrong');
        const results = await Promise.allSettled(
          correctWritesLast
            ? [wrong.finally(releaseLate), correct]
            : [correct.finally(releaseLate), wrong]
        );
        return { results, row };
      };

      it('skips the reset once the link is locked, so the lock stays consistent', async () => {
        const { results, row } = await run(true);

        expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
        expect(row).toEqual({
          locked: true,
          retryCount: MAX_ACCESS_LINK_RETRIES,
        });
      });

      it('skips the lock once the count was reset below the limit', async () => {
        const { results, row } = await run(false);

        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
        expect(row).toEqual({ locked: false, retryCount: 0 });
      });
    });
  });

  describe('read paths apply the same rule', () => {
    it('getAccessLinkChallenge', async () => {
      h.prisma.accessLink.findUniqueOrThrow.mockResolvedValue({});
      await getAccessLinkChallenge('link-1');
      expect(
        h.prisma.accessLink.findUniqueOrThrow.mock.calls[0][0].where
      ).toEqual({ id: 'link-1', ...USABLE });
    });

    it('getAccessLinkChallenge refuses a locked or expired link', async () => {
      h.prisma.accessLink.findUniqueOrThrow.mockRejectedValue(
        new Error('NotFoundError')
      );
      await expect(getAccessLinkChallenge('link-1')).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
    });

    it('getContainerForAccessLink', async () => {
      h.prisma.accessLink.findUniqueOrThrow.mockResolvedValue({
        share: { container: { id: 'container-1' } },
      });
      await getContainerForAccessLink('link-1');
      expect(
        h.prisma.accessLink.findUniqueOrThrow.mock.calls[0][0].where
      ).toEqual({ id: 'link-1', ...USABLE });
      // Viewing the container never touches the retry count.
      expect(h.prisma.accessLink.update).not.toHaveBeenCalled();
    });

    it('getContainerForAccessLink refuses a locked or expired link', async () => {
      h.prisma.accessLink.findUniqueOrThrow.mockRejectedValue(
        new Error('NotFoundError')
      );
      await expect(getContainerForAccessLink('link-1')).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
    });

    it('isAccessLinkValid', async () => {
      h.prisma.accessLink.findMany.mockResolvedValue([]);
      expect(await isAccessLinkValid('link-1')).toBeNull();
      expect(h.prisma.accessLink.findMany.mock.calls[0][0].where).toEqual({
        id: 'link-1',
        ...USABLE,
      });
    });
  });
});
