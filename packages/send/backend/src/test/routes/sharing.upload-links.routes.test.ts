import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/sharing/:uploadId/links returns access-link metadata for a file.
 * Authorization is resolved from the upload id: the model queries are scoped
 * to the caller's owned containers, so a caller only ever sees links for
 * uploads whose container they own. This suite pins that behaviour:
 *   - an unauthenticated request is rejected before any lookup;
 *   - an authenticated caller's own id is the scope passed to the lookups;
 *   - a caller who does not own the upload's container gets an empty list (the
 *     scoped query matches nothing) rather than another owner's links.
 */

const { mockByUploadId, mockByUploadIdAndWrappedKey } = vi.hoisted(() => ({
  mockByUploadId: vi.fn(),
  mockByUploadIdAndWrappedKey: vi.fn(),
}));

vi.mock('../../models/sharing', () => ({
  acceptAccessLink: vi.fn(),
  acceptInvitation: vi.fn(),
  burnEphemeralConversation: vi.fn(),
  checkIfAccessLinkCanBeCreated: vi.fn(),
  createAccessLink: vi.fn(),
  createInvitationFromAccessLink: vi.fn(),
  getAccessLinkChallenge: vi.fn(),
  getAccessLinksByUploadId: mockByUploadId,
  getAccessLinksByUploadIdAndWrappedKey: mockByUploadIdAndWrappedKey,
  getContainerForAccessLink: vi.fn(),
  isAccessLinkValid: vi.fn(),
  removeAccessLink: vi.fn(),
  resetAccessLinkRetryCount: vi.fn(),
  updateAccessLink: vi.fn(),
}));

// The caller id the route scopes on comes from the signature-verified
// authorization cookie (requireJWT verifies it upstream). Control it per-test.
const { mockGetData } = vi.hoisted(() => ({ mockGetData: vi.fn() }));
vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: mockGetData,
}));

// Only requireJWT gates this route now; keep the real one so the unauthenticated
// case exercises the genuine gate. Its dependencies are mocked to a deny/allow
// switch driven per-test.
const { mockValidateJWT } = vi.hoisted(() => ({ mockValidateJWT: vi.fn() }));
vi.mock('../../auth/jwt', () => ({ validateJWT: mockValidateJWT }));
vi.mock('../../auth/oidc', () => ({
  extractBearerToken: () => null,
  isAccessTokenRevoked: vi.fn().mockResolvedValue(false),
  validateOIDCToken: vi.fn(),
}));

vi.mock('../../middleware/rate-limit', () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

vi.mock('@send-backend/utils', () => ({
  // requireJWT reads cookies through this helper; validateJWT (mocked) decides
  // the outcome, so a fixed Bearer value is enough.
  getCookie: () => 'Bearer test-token',
  addExpiryToContainer: (c: unknown) => c,
  // Mirror the real helper: append the password hash to the id so the test can
  // assert the sensitive field would be exposed if scoping failed.
  formatAccessLinkWithPasswordHash: (
    links: { id: string; passwordHash?: string }[]
  ) =>
    links.map((l) =>
      l.passwordHash ? { ...l, id: `${l.id}#${l.passwordHash}` } : l
    ),
}));

vi.mock('@send-backend/metrics', () => ({
  useMetrics: () => ({ capture: vi.fn(), shutdown: vi.fn() }),
}));

import router from '../../routes/sharing';

const app = express();
app.use(express.json());
app.use('/api/sharing', router);

const OWNER_ID = 'owner-1';
const ATTACKER_ID = 'attacker-2';
const UPLOAD_ID = 'upload-xyz';
const URL = `/api/sharing/${UPLOAD_ID}/links`;
const OWNER_LINK = { id: 'link-1', passwordHash: 'secret-hash' };

describe('GET /api/sharing/:uploadId/links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: valid token, caller is the owner. The scoped model returns the
    // owner's links only when queried with the owner's id.
    mockValidateJWT.mockReturnValue('valid');
    mockGetData.mockReturnValue({ id: OWNER_ID });
    mockByUploadId.mockImplementation(async (_uploadId, ownerId) =>
      ownerId === OWNER_ID ? [OWNER_LINK] : []
    );
    mockByUploadIdAndWrappedKey.mockImplementation(
      async (_uploadId, ownerId) => (ownerId === OWNER_ID ? [OWNER_LINK] : [])
    );
  });

  it('rejects an unauthenticated request without querying for links', async () => {
    mockValidateJWT.mockReturnValue(null); // no token

    const res = await request(app).get(URL);

    expect([401, 403]).toContain(res.status);
    expect(mockByUploadId).not.toHaveBeenCalled();
    expect(mockByUploadIdAndWrappedKey).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the authenticated caller and returns their links', async () => {
    const res = await request(app).get(URL);

    expect(res.status).toBe(200);
    expect(mockByUploadId).toHaveBeenCalledWith(UPLOAD_ID, OWNER_ID);
    // The route returns the scoped model result as-is; nothing is appended or
    // reformatted on the way out.
    expect(res.body).toEqual([OWNER_LINK]);
  });

  it('scopes the file-type lookup to the authenticated caller', async () => {
    const res = await request(app).get(`${URL}?type=file`);

    expect(res.status).toBe(200);
    expect(mockByUploadIdAndWrappedKey).toHaveBeenCalledWith(
      UPLOAD_ID,
      OWNER_ID
    );
    expect(mockByUploadId).not.toHaveBeenCalled();
  });

  it('returns no links to a caller who does not own the upload container', async () => {
    mockGetData.mockReturnValue({ id: ATTACKER_ID });

    const res = await request(app).get(URL);

    // The query is scoped to the attacker's id, which owns nothing here, so the
    // owner's links (and their password hashes) never leave the server.
    expect(res.status).toBe(200);
    expect(mockByUploadId).toHaveBeenCalledWith(UPLOAD_ID, ATTACKER_ID);
    expect(res.body).toEqual([]);
  });

  it('returns no links to a non-owner on the file-type path', async () => {
    mockGetData.mockReturnValue({ id: ATTACKER_ID });

    const res = await request(app).get(`${URL}?type=file`);

    expect(res.status).toBe(200);
    expect(mockByUploadIdAndWrappedKey).toHaveBeenCalledWith(
      UPLOAD_ID,
      ATTACKER_ID
    );
    expect(res.body).toEqual([]);
  });
});
