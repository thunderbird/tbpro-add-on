import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The flag-flipping procedure writes to the database, so it must sit behind
// `isAuthed`. Here that middleware is enforcing: it rejects a caller with no
// session. The passwordless flip must be refused; the legacy add-password
// no-op stays public for backward compatibility.
const { containersModel } = vi.hoisted(() => ({
  containersModel: {
    markAccessLinkAsPasswordless: vi.fn(),
  },
}));

vi.mock('@send-backend/models/sharing', () => ({
  deleteAccessLink: vi.fn(),
  getAccessLinkRetryCount: vi.fn(),
  incrementAccessLinkRetryCount: vi.fn(),
}));
vi.mock('../../models/containers', () => containersModel);
vi.mock('@send-backend/models/verification', () => ({
  getEncryptedPassphrase: vi.fn(),
  storeEncryptedPassphrase: vi.fn(),
}));
vi.mock('@send-backend/ws/verify', () => ({
  verificationEmitter: { emit: vi.fn() },
}));
vi.mock('../../trpc/middlewares', () => ({
  getAuthenticatedUserId: vi.fn(
    async (ctx: { user?: { id?: string } }) => ctx?.user?.id ?? null
  ),
  isAuthed: ({
    ctx,
    next,
  }: {
    ctx: { user: unknown };
    next: () => unknown;
  }) => {
    if (!ctx?.user) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next();
  },
}));

import { sharingRouter } from '../../trpc/sharing';

const anonymousCaller = sharingRouter.createCaller({
  res: null,
  authorization: null,
  user: null,
  cookies: { jwtToken: null, jwtRefreshToken: null },
  oidcUser: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

describe('trpc sharing router: markAccessLinkAsPasswordless requires auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated caller before touching the database', async () => {
    await expect(
      anonymousCaller.markAccessLinkAsPasswordless({ linkId: 'link-1' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(containersModel.markAccessLinkAsPasswordless).not.toHaveBeenCalled();
  });

  it('leaves the legacy add-password no-op publicly callable', async () => {
    const result = await anonymousCaller.addPasswordToAccessLink({
      linkId: 'link-1',
      password: 'ignored',
    });

    expect(result).toEqual({ id: 'link-1' });
  });
});
