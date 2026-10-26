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

  // Races run in parallel, one link each, so they only contend with themselves.
  const createLinks = async () => {
    const ids = Array.from({ length: RUNS }, () => `lockout-${uuidv4()}`);
    await prisma.accessLink.createMany({
      data: ids.map((id) => ({
        id,
        shareId,
        wrappedKey: 'wrapped',
        salt: 'salt',
        challengeKey: 'key',
        challengeSalt: 'salt',
        challengeCiphertext: 'ciphertext',
        challengePlaintext: ANSWER,
        retryCount: MAX_ACCESS_LINK_RETRIES - 2,
      })),
    });
    return ids;
  };
  const readLinks = (ids: string[]) =>
    prisma.accessLink.findMany({ where: { id: { in: ids } } });

  it('a correct and a wrong answer near the limit never lock the link', async () => {
    const ids = await createLinks();
    const outcomes = await Promise.all(
      ids.map(async (id, i) => {
        const correct = acceptAccessLink(id, ANSWER);
        const wrong = acceptAccessLink(id, 'wrong');
        const [c, w] = await Promise.allSettled(
          i % 2 === 0 ? [correct, wrong] : [wrong, correct]
        );
        return i % 2 === 0 ? [c.status, w.status] : [w.status, c.status];
      })
    );

    expect(outcomes).toEqual(ids.map(() => ['fulfilled', 'rejected']));
    const rows = await readLinks(ids);
    expect(rows.filter((row) => row.locked)).toEqual([]);
  });

  it('a lock never coexists with a reset count', async () => {
    const ids = await createLinks();
    await Promise.all(
      ids.map((id) =>
        Promise.allSettled([
          acceptAccessLink(id, 'wrong'),
          acceptAccessLink(id, ANSWER),
          acceptAccessLink(id, 'wrong'),
        ])
      )
    );

    const rows = await readLinks(ids);
    expect(rows).toHaveLength(RUNS);
    expect(
      rows.filter(
        (row) => row.locked && row.retryCount < MAX_ACCESS_LINK_RETRIES
      )
    ).toEqual([]);
  });

  it('reports incorrect, then locked, and not found for a missing link', async () => {
    const [id] = await createLinks();
    await expect(acceptAccessLink(id, 'wrong')).rejects.toMatchObject({
      message: 'ACCESSLINK_CHALLENGE_INCORRECT',
      attemptsRemaining: 1,
    });
    await expect(acceptAccessLink(id, 'wrong')).rejects.toThrow(
      'ACCESSLINK_LOCKED'
    );
    await expect(acceptAccessLink(id, ANSWER)).rejects.toThrow(
      'ACCESSLINK_LOCKED'
    );
    await expect(
      acceptAccessLink(`missing-${uuidv4()}`, ANSWER)
    ).rejects.toThrow('ACCESSLINK_NOT_FOUND');
  });
});
