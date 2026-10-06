import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every model function the sharing tRPC router imports, so that any database
// access from the procedure under test is observable (and provably absent).
const { sharingModel } = vi.hoisted(() => ({
  sharingModel: {
    deleteAccessLink: vi.fn(),
    getAccessLinkRetryCount: vi.fn(),
    incrementAccessLinkRetryCount: vi.fn(),
  },
}));

const { containersModel } = vi.hoisted(() => ({
  containersModel: {
    markAccessLinkAsPasswordless: vi.fn(),
  },
}));

vi.mock('@send-backend/models/sharing', () => sharingModel);
vi.mock('../../models/containers', () => containersModel);
vi.mock('@send-backend/models/verification', () => ({
  getEncryptedPassphrase: vi.fn(),
  storeEncryptedPassphrase: vi.fn(),
}));
vi.mock('@send-backend/ws/verify', () => ({
  verificationEmitter: { emit: vi.fn() },
}));
vi.mock('../../trpc/middlewares', () => ({
  isAuthed: ({ next }) => next(),
  getAuthenticatedUserId: vi.fn(async () => 'owner-1'),
}));

import { sharingRouter } from '../../trpc/sharing';
import { captureConsole } from '../testutils';

// A value that could only appear in the output if it was copied from the
// request; nothing else in the test produces it.
const SECRET = 'request-secret-7f3a9c2e';

const caller = sharingRouter.createCaller({
  res: null,
  authorization: null,
  user: null,
  cookies: { jwtToken: null, jwtRefreshToken: null },
  oidcUser: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

describe('trpc sharing router: addPasswordToAccessLink', () => {
  let consoleCapture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleCapture = captureConsole();
  });

  afterEach(() => {
    consoleCapture.restore();
  });

  it('acknowledges the request without touching the database', async () => {
    const result = await caller.addPasswordToAccessLink({
      linkId: 'link-1',
      password: SECRET,
    });

    expect(result).toEqual({ id: 'link-1' });

    for (const modelFn of Object.values(sharingModel)) {
      expect(modelFn).not.toHaveBeenCalled();
    }
  });

  it('never echoes or logs the request secret', async () => {
    const result = await caller.addPasswordToAccessLink({
      linkId: 'link-1',
      password: SECRET,
    });

    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(consoleCapture.output()).not.toContain(SECRET);
  });

  it('accepts a call without the legacy field', async () => {
    const result = await caller.addPasswordToAccessLink({ linkId: 'link-1' });

    expect(result).toEqual({ id: 'link-1' });
  });
});

describe('trpc sharing router: markAccessLinkAsPasswordless', () => {
  let consoleCapture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleCapture = captureConsole();
  });

  afterEach(() => {
    consoleCapture.restore();
  });

  it('flips the flag through the model, scoped to the caller, and reports success', async () => {
    containersModel.markAccessLinkAsPasswordless.mockResolvedValue({
      id: 'link-1',
    });

    const result = await caller.markAccessLinkAsPasswordless({
      linkId: 'link-1',
    });

    expect(containersModel.markAccessLinkAsPasswordless).toHaveBeenCalledWith(
      'link-1',
      'owner-1'
    );
    expect(result).toEqual({ id: 'link-1' });
  });

  it('surfaces a failure as NOT_FOUND, hiding whether the link exists', async () => {
    // The ownership-scoped update rejects identically for a missing link and
    // a link the caller does not own, so the error cannot be used as an
    // existence oracle.
    containersModel.markAccessLinkAsPasswordless.mockRejectedValue(
      new Error('record not found')
    );

    await expect(
      caller.markAccessLinkAsPasswordless({ linkId: 'link-1' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
