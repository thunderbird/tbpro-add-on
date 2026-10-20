import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateItem,
  mockDeleteItem,
  mockIsUploadOwnedBy,
  mockUpdateItemName,
  mockGetAuthenticatedUserData,
} = vi.hoisted(() => ({
  mockCreateItem: vi.fn(),
  mockDeleteItem: vi.fn(),
  mockIsUploadOwnedBy: vi.fn(),
  mockUpdateItemName: vi.fn(),
  mockGetAuthenticatedUserData: vi.fn(),
}));

// Only the item handlers run here; the rest of the barrel is stubbed so the
// import resolves without a database.
vi.mock('@send-backend/models', () => ({
  createItem: mockCreateItem,
  deleteItem: mockDeleteItem,
  getContainerInfo: vi.fn(),
  getContainerWithDescendants: vi.fn(),
  isUploadOwnedBy: mockIsUploadOwnedBy,
  reportUpload: vi.fn(),
  updateItemName: mockUpdateItemName,
}));
vi.mock('@send-backend/storage', () => ({ default: { del: vi.fn() } }));

// Guards become pass-throughs so the tests exercise the handlers' own
// scoping: which model call is made and with which ids.
vi.mock('../../middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware')>();
  const passthrough = (_req, _res, next) => next();
  return {
    ...actual,
    requireJWT: passthrough,
    getGroupMemberPermissions: passthrough,
    requireWritePermission: passthrough,
    requireAdminPermission: passthrough,
    getAuthenticatedUserData: mockGetAuthenticatedUserData,
  };
});
vi.mock('../../middleware/rate-limit', () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

import { BaseError, ITEM_NOT_FOUND } from '../../errors/models';
import { errorHandler } from '../../errors/routes';
import router from '../../routes/containers';

const app = express();
app.use(express.json());
app.use('/api/containers', router);
app.use(errorHandler);

const NOT_FOUND_BODY = {
  status: 'error',
  statusCode: 404,
  message: 'Could not find item.',
};

const CONTAINER = 'container-1';
const USER = 'user-1';

describe('container item routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUserData.mockReturnValue({ id: USER, email: '' });
  });

  describe('POST /:containerId/item', () => {
    const body = {
      name: 'file.txt',
      uploadId: 'upload-1',
      type: 'FILE',
      wrappedKey: 'wk',
    };

    it('creates the item when the caller owns the upload', async () => {
      mockIsUploadOwnedBy.mockResolvedValue(true);
      mockCreateItem.mockResolvedValue({ id: 7, ...body });

      const res = await request(app)
        .post(`/api/containers/${CONTAINER}/item`)
        .send(body);

      expect(res.status).toBe(200);
      expect(mockIsUploadOwnedBy).toHaveBeenCalledWith('upload-1', USER);
      expect(mockCreateItem).toHaveBeenCalledWith(
        'file.txt',
        CONTAINER,
        'upload-1',
        'FILE',
        'wk',
        false,
        undefined
      );
    });

    it('refuses an upload the caller does not own', async () => {
      mockIsUploadOwnedBy.mockResolvedValue(false);

      const res = await request(app)
        .post(`/api/containers/${CONTAINER}/item`)
        .send(body);

      expect(res.status).toBe(403);
      expect(mockCreateItem).not.toHaveBeenCalled();
    });

    it('refuses a missing uploadId', async () => {
      const res = await request(app)
        .post(`/api/containers/${CONTAINER}/item`)
        .send({ ...body, uploadId: undefined });

      expect(res.status).toBe(403);
      expect(mockIsUploadOwnedBy).not.toHaveBeenCalled();
      expect(mockCreateItem).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /:containerId/item/:itemId', () => {
    it('scopes the delete to the container and caller', async () => {
      mockDeleteItem.mockResolvedValue({ wrappedKey: 'wk' });

      const res = await request(app)
        .delete(`/api/containers/${CONTAINER}/item/42`)
        .send({ shouldDeleteUpload: false });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ wrappedKey: 'wk' });
      expect(mockDeleteItem).toHaveBeenCalledWith(42, CONTAINER, USER, false);
    });

    it('responds only after the delete has finished', async () => {
      let finish: (v: { wrappedKey: string }) => void = () => {};
      mockDeleteItem.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      let responded = false;
      const pending = request(app)
        .delete(`/api/containers/${CONTAINER}/item/42`)
        .then((res) => {
          responded = true;
          return res;
        });

      await vi.waitFor(() => expect(mockDeleteItem).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 20));
      expect(responded).toBe(false);

      finish({ wrappedKey: 'wk' });
      const res = await pending;
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ wrappedKey: 'wk' });
    });

    it('answers 404 when no item matches in the container', async () => {
      mockDeleteItem.mockRejectedValue(new BaseError(ITEM_NOT_FOUND));

      const res = await request(app).delete(
        `/api/containers/${CONTAINER}/item/42`
      );

      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND_BODY);
    });

    it('answers an error, not 202, when the delete fails', async () => {
      mockDeleteItem.mockRejectedValue(new Error('storage down'));

      const res = await request(app).delete(
        `/api/containers/${CONTAINER}/item/42`
      );

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        status: 'error',
        statusCode: 500,
        message: 'Could not delete item.',
      });
    });

    it('refuses when no authenticated user is resolved', async () => {
      mockGetAuthenticatedUserData.mockReturnValue(null);

      const res = await request(app).delete(
        `/api/containers/${CONTAINER}/item/42`
      );

      expect(res.status).toBe(403);
      expect(mockDeleteItem).not.toHaveBeenCalled();
    });
  });

  describe('POST /:containerId/item/:itemId/rename', () => {
    it('renames within the container from the path', async () => {
      mockUpdateItemName.mockResolvedValue({ id: 42, name: 'new.txt' });

      const res = await request(app)
        .post(`/api/containers/${CONTAINER}/item/42/rename`)
        .send({ name: 'new.txt' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 42, name: 'new.txt' });
      expect(mockUpdateItemName).toHaveBeenCalledWith(42, CONTAINER, 'new.txt');
    });

    it('answers 404 when no item matches in the container', async () => {
      mockUpdateItemName.mockRejectedValue(new BaseError(ITEM_NOT_FOUND));

      const res = await request(app)
        .post(`/api/containers/${CONTAINER}/item/42/rename`)
        .send({ name: 'new.txt' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND_BODY);
    });

    it('answers 500 for any other update failure', async () => {
      mockUpdateItemName.mockRejectedValue(new Error('db down'));

      const res = await request(app)
        .post(`/api/containers/${CONTAINER}/item/42/rename`)
        .send({ name: 'new.txt' });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Could not rename item.');
    });
  });
});
