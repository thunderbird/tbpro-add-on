import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import router from '../../routes/containers';

const { mockReportUpload, mockIsUploadSharedByLink } = vi.hoisted(() => ({
  mockReportUpload: vi.fn(),
  mockIsUploadSharedByLink: vi.fn(),
}));

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(router);

vi.mock('@send-backend/models', () => {
  const models = {
    reportUpload: mockReportUpload,
    isUploadSharedByLink: mockIsUploadSharedByLink,
    isUploadInMemberContainer: vi.fn(),
  };
  return {
    default: models,
    ...models,
  };
});

describe('Containers routes', () => {
  it('queues a report from a share-link recipient', async () => {
    mockReportUpload.mockResolvedValue({ id: 'dummy' });
    mockIsUploadSharedByLink.mockResolvedValue(true);

    const uploadId = '11111111-1111-4111-8111-111111111111';
    const containerId = '22222222-2222-4222-8222-222222222222';

    const response = await request(app)
      .post(`/${containerId}/report`)
      .send({ uploadId, linkId: 'link-1' })
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json');

    expect(response.body).toEqual({ message: 'reported successfully' });
    expect(response.status).toBe(200);

    expect(mockIsUploadSharedByLink).toBeCalledWith(
      uploadId,
      'link-1',
      containerId
    );
    expect(mockReportUpload).toBeCalledWith(uploadId);
  });
});
