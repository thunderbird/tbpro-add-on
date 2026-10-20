import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Server-side retry counting and the locked/expired rule shared by every path
// that releases an access link's challenge, key or container (#1006, #1010).

const h = vi.hoisted(() => ({
  prisma: {
    accessLink: {
      update: vi.fn(),
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

describe('access-link lockout and validity', () => {
  let consoleCapture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    vi.clearAllMocks();
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
    it('counts the attempt on a usable link only', async () => {
      h.prisma.accessLink.update
        .mockResolvedValueOnce(linkAfterAttempt(1))
        .mockResolvedValue({ id: 'link-1' });

      await acceptAccessLink('link-1', ANSWER);

      expect(updateCalls()[0]).toMatchObject({
        where: { id: 'link-1', ...USABLE },
        data: { retryCount: { increment: 1 } },
      });
    });

    it('resets the count and returns the link on a correct answer', async () => {
      h.prisma.accessLink.update
        .mockResolvedValueOnce(linkAfterAttempt(MAX_ACCESS_LINK_RETRIES))
        .mockResolvedValue({ id: 'link-1' });

      const link = await acceptAccessLink('link-1', ANSWER);

      expect(link).toMatchObject({
        wrappedKey: 'wrapped',
        salt: 'salt',
        share: { containerId: 'container-1' },
      });
      expect(updateCalls()).toHaveLength(2);
      expect(updateCalls()[1]).toMatchObject({
        where: { id: 'link-1' },
        data: { retryCount: 0 },
      });
    });

    it('refuses a wrong answer below the limit without locking', async () => {
      h.prisma.accessLink.update.mockResolvedValueOnce(
        linkAfterAttempt(MAX_ACCESS_LINK_RETRIES - 1)
      );

      await expect(acceptAccessLink('link-1', 'wrong')).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
      expect(updateCalls()).toHaveLength(1);
    });

    it('locks the link on the wrong answer that reaches the limit', async () => {
      h.prisma.accessLink.update
        .mockResolvedValueOnce(linkAfterAttempt(MAX_ACCESS_LINK_RETRIES))
        .mockResolvedValue({ id: 'link-1' });

      await expect(acceptAccessLink('link-1', 'wrong')).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
      expect(updateCalls()[1]).toMatchObject({
        where: { id: 'link-1' },
        data: { locked: true },
      });
    });

    it('refuses even a correct answer once concurrent attempts passed the limit', async () => {
      h.prisma.accessLink.update
        .mockResolvedValueOnce(linkAfterAttempt(MAX_ACCESS_LINK_RETRIES + 1))
        .mockResolvedValue({ id: 'link-1' });

      await expect(acceptAccessLink('link-1', ANSWER)).rejects.toThrow(
        'ACCESSLINK_NOT_FOUND'
      );
      expect(updateCalls()[1]).toMatchObject({ data: { locked: true } });
      expect(updateCalls().some((c) => c.data.retryCount === 0)).toBe(false);
    });

    it('treats a non-string answer as wrong', async () => {
      h.prisma.accessLink.update.mockResolvedValueOnce(linkAfterAttempt(1));

      await expect(
        acceptAccessLink('link-1', { not: ANSWER } as unknown)
      ).rejects.toThrow('ACCESSLINK_NOT_FOUND');
      expect(updateCalls()).toHaveLength(1);
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
