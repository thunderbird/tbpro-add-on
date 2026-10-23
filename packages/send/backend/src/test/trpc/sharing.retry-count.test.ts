import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Older clients still call these procedures. Failed attempts are now counted by
// the challenge endpoint, so the legacy increment must not change anything
// (#1006) while both keep returning `{ id, retryCount }`.
const { sharingModel } = vi.hoisted(() => ({
  sharingModel: {
    deleteAccessLink: vi.fn(),
    getAccessLinkRetryCount: vi.fn(),
  },
}));

vi.mock('@send-backend/models/sharing', () => sharingModel);
vi.mock('../../models/containers', () => ({
  markAccessLinkAsPasswordless: vi.fn(),
}));
vi.mock('@send-backend/models/verification', () => ({
  getEncryptedPassphrase: vi.fn(),
  storeEncryptedPassphrase: vi.fn(),
}));
vi.mock('@send-backend/ws/verify', () => ({
  verificationEmitter: { emit: vi.fn() },
}));

import { sharingRouter } from '../../trpc/sharing';
import { captureConsole } from '../testutils';

const anonymousCaller = sharingRouter.createCaller({
  res: null,
  authorization: null,
  user: null,
  cookies: { jwtToken: null, jwtRefreshToken: null },
  oidcUser: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

describe('trpc sharing router: legacy retry-count procedures', () => {
  let consoleCapture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleCapture = captureConsole();
  });

  afterEach(() => {
    consoleCapture.restore();
  });

  it('incrementPasswordRetryCount returns the current count without changing it', async () => {
    sharingModel.getAccessLinkRetryCount.mockResolvedValue({
      id: 'link-1',
      retryCount: 2,
    });

    const result = await anonymousCaller.incrementPasswordRetryCount({
      linkId: 'link-1',
    });

    expect(result).toEqual({ id: 'link-1', retryCount: 2 });
    // The model mock exposes no write helper, so the read is the only call.
    expect(sharingModel.getAccessLinkRetryCount).toHaveBeenCalledWith('link-1');
    expect(sharingModel.deleteAccessLink).not.toHaveBeenCalled();
  });

  it('getPasswordRetryCount returns the current count', async () => {
    sharingModel.getAccessLinkRetryCount.mockResolvedValue({
      id: 'link-1',
      retryCount: 5,
    });

    await expect(
      anonymousCaller.getPasswordRetryCount({ linkId: 'link-1' })
    ).resolves.toEqual({ id: 'link-1', retryCount: 5 });
  });

  it('both answer 0 for an unknown link, as before', async () => {
    sharingModel.getAccessLinkRetryCount.mockResolvedValue(null);

    await expect(
      anonymousCaller.incrementPasswordRetryCount({ linkId: 'missing' })
    ).resolves.toEqual({ id: 'missing', retryCount: 0 });
    await expect(
      anonymousCaller.getPasswordRetryCount({ linkId: 'missing' })
    ).resolves.toEqual({ id: 'missing', retryCount: 0 });
  });
});
