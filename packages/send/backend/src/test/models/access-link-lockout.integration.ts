import { PrismaClient, UserTier } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Overlapping challenge answers against a real database: the row lock taken by
// the counting update must keep a correct answer from leaving the link locked.

vi.mock('../../storage', () => ({ default: {} }));

import { MAX_ACCESS_LINK_RETRIES } from '../../config';
import { acceptAccessLink } from '../../models/sharing';

const ANSWER = 'challenge-plaintext';
const RUNS = 25;

describe('acceptAccessLink under overlapping attempts', () => {
  const prisma = new PrismaClient();
  let userId: string;
  let groupId: number;
  let shareId: number;

  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = await prisma.user.create({ data: { tier: UserTier.FREE } });
    const group = await prisma.group.create({ data: {} });
    const container = await prisma.container.create({
      data: {
        name: 'access-link-lockout',
        type: 'FOLDER',
        ownerId: user.id,
        groupId: group.id,
      },
    });
    const share = await prisma.share.create({
      data: { containerId: container.id, senderId: user.id },
    });
    userId = user.id;
    groupId = group.id;
    shareId = share.id;
  });

  afterAll(async () => {
    // Deleting the group cascades to the container, its share and links.
    await prisma.group.delete({ where: { id: groupId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const createLink = (id: string) =>
    prisma.accessLink.create({
      data: {
        id,
        shareId,
        wrappedKey: 'wrapped',
        salt: 'salt',
        challengeKey: 'key',
        challengeSalt: 'salt',
        challengeCiphertext: 'ciphertext',
        challengePlaintext: ANSWER,
        retryCount: MAX_ACCESS_LINK_RETRIES - 2,
      },
    });

  it('a correct and a wrong answer near the limit never lock the link', async () => {
    for (let i = 0; i < RUNS; i++) {
      const id = `lockout-${uuidv4()}`;
      await createLink(id);
      const attempts =
        i % 2 === 0
          ? [acceptAccessLink(id, ANSWER), acceptAccessLink(id, 'wrong')]
          : [acceptAccessLink(id, 'wrong'), acceptAccessLink(id, ANSWER)];
      const [first, second] = await Promise.allSettled(attempts);
      const [correct, wrong] = i % 2 === 0 ? [first, second] : [second, first];

      expect(correct.status).toBe('fulfilled');
      expect(wrong.status).toBe('rejected');
      const row = await prisma.accessLink.findUniqueOrThrow({ where: { id } });
      expect(row.locked).toBe(false);
    }
  });

  it('a lock never coexists with a reset count', async () => {
    for (let i = 0; i < RUNS; i++) {
      const id = `lockout-${uuidv4()}`;
      await createLink(id);
      await Promise.allSettled([
        acceptAccessLink(id, 'wrong'),
        acceptAccessLink(id, ANSWER),
        acceptAccessLink(id, 'wrong'),
      ]);
      const row = await prisma.accessLink.findUniqueOrThrow({ where: { id } });
      if (row.locked) {
        expect(row.retryCount).toBeGreaterThanOrEqual(MAX_ACCESS_LINK_RETRIES);
      }
    }
  });
});
