import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UPLOAD_NOT_FOUND } from '@send-backend/errors/models';

const { mockReportSuspiciousFile, mockReportUpload } = vi.hoisted(() => ({
  mockReportSuspiciousFile: vi.fn(),
  mockReportUpload: vi.fn(),
}));

// The route imports `reportSuspiciousFile` from `../models/uploads` and
// `reportUpload` from the `@send-backend/models` barrel — mock both.
vi.mock('../../models/uploads', () => ({
  reportSuspiciousFile: mockReportSuspiciousFile,
}));
vi.mock('@send-backend/models', () => ({
  reportUpload: mockReportUpload,
  deleteUploadsByIds: vi.fn(),
}));

// Avoid the real storage client (Backblaze token timer + AWS SDK) at import.
vi.mock('@send-backend/storage', () => ({
  default: { del: vi.fn() },
}));

vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: vi.fn(() => ({ id: 'user-1' })),
}));

// All middleware becomes a pass-through so we exercise the handler directly.
vi.mock('../../middleware', () => {
  const passthrough = (_req, _res, next) => next();
  return {
    requireJWT: passthrough,
    checkStorageLimit: passthrough,
    getGroupMemberPermissions: passthrough,
    requireWritePermission: passthrough,
  };
});

// vi.mock() calls above are hoisted above imports, so this router picks up the
// stubs.
import router from '../../routes/uploads';
import { errorHandler } from '../../errors/routes';

const app = express();
app.use(express.json());
app.use('/api/uploads', router);
// `errorHandler` has a 3-arg signature, so Express would register it as normal
// middleware and skip it for errors (in prod, Sentry's 4-arg handler runs
// first). Wrap it in the 4-arg error-middleware shape so the route's async
// boundary is exercised end to end here.
app.use((err, req, res, next) => errorHandler(err, req, res, next));

describe('POST /api/uploads/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a known upload and returns 200', async () => {
    mockReportSuspiciousFile.mockResolvedValue([{ id: 'report-1' }]);
    mockReportUpload.mockResolvedValue(undefined);

    const response = await request(app)
      .post('/api/uploads/report')
      .send({ uploadId: 'known-id' })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(mockReportSuspiciousFile).toHaveBeenCalledWith('known-id');
    expect(mockReportUpload).toHaveBeenCalledWith('known-id');
    expect(response.body).toMatchObject({ message: 'Report received' });
  });

  // Regression for private #49: an unknown id must not crash the process. Before
  // the fix the route had no async boundary, so this rejection was unhandled and
  // terminated Node; now it is answered with a 404.
  it('answers 404 (does not crash) when the upload id is unknown', async () => {
    mockReportSuspiciousFile.mockRejectedValue(new Error(UPLOAD_NOT_FOUND));

    const response = await request(app)
      .post('/api/uploads/report')
      .send({ uploadId: 'does-not-exist' })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(404);
    expect(mockReportUpload).not.toHaveBeenCalled();
  });
});
