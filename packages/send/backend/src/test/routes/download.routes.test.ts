import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCheckIdAgainstSuspiciousFiles, mockGetDownloadBucketUrl, mockGet } =
  vi.hoisted(() => ({
    mockCheckIdAgainstSuspiciousFiles: vi.fn(),
    mockGetDownloadBucketUrl: vi.fn(),
    // `FileStore.get` no longer exists. Stubbed anyway, and asserted on below,
    // because the status code alone does NOT pin this: a reinstated `GET /:id`
    // whose `storage.get` returns nothing answers 404 too, so the suite would
    // stay green while the route was back. Verified by mutation.
    mockGet: vi.fn(),
  }));

vi.mock('@send-backend/models/uploads', () => ({
  checkIdAgainstSuspiciousFiles: mockCheckIdAgainstSuspiciousFiles,
}));

// Avoid the real storage client (Backblaze token timer + AWS SDK) at import.
vi.mock('@send-backend/storage', () => ({
  default: {
    getDownloadBucketUrl: mockGetDownloadBucketUrl,
    get: mockGet,
    length: vi.fn(),
  },
}));

import router from '../../routes/download';

const app = express();
app.use('/api/download', router);
app.use((_, res) => res.status(404).send('404 Not Found'));

describe('/api/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckIdAgainstSuspiciousFiles.mockResolvedValue(false);
    mockGetDownloadBucketUrl.mockResolvedValue('https://bucket.example/signed');
  });

  // `GET /:id` streamed any object straight out of the bucket by id, with no
  // authentication -- the read-side twin of the anonymous upload path removed
  // in private-issue-tracking#44. Its only caller was the filesystem download
  // branch, which is gone.
  it('no longer serves object bytes by id', async () => {
    const response = await request(app).get('/api/download/some-upload-id');

    expect(response.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('still hands out a presigned url', async () => {
    const response = await request(app).get(
      '/api/download/some-upload-id/signed'
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ url: 'https://bucket.example/signed' });
  });

  it('refuses a presigned url for a file reported as suspicious', async () => {
    mockCheckIdAgainstSuspiciousFiles.mockResolvedValue(true);

    const response = await request(app).get(
      '/api/download/some-upload-id/signed'
    );

    expect(response.status).toBe(401);
    expect(mockGetDownloadBucketUrl).not.toHaveBeenCalled();
  });
});
