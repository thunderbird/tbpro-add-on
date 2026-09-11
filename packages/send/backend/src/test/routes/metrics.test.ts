import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import router from '../../routes/metrics';

const { mockcapture, mockAuth, mockAuthenticatedRequest } = vi.hoisted(() => ({
  mockcapture: vi.fn(),
  mockAuth: vi.fn(),
  mockAuthenticatedRequest: vi.fn(),
}));

vi.mock('@send-backend/metrics', () => {
  const mMetrics = {
    useMetrics: vi.fn(() => ({
      capture: mockcapture,
      shutdown: vi.fn(),
    })),
  };
  return {
    ...mMetrics,
  };
});

vi.mock('@send-backend/auth/client', () => {
  const mMetrics = {
    getDataFromAuthenticatedRequest: mockAuthenticatedRequest,
    getJWTfromToken: mockAuth,
  };
  return {
    ...mMetrics,
  };
});

vi.mock('@send-backend/utils/session', () => {
  return {
    getUniqueHashFromAnonId: vi.fn().mockReturnValue('hash'),
  };
});

const app = express();
app.use(express.json());
app.use(router);

describe('POST /api/metrics/page-load', () => {
  it('should capture metrics for anon users', async () => {
    mockAuth.mockReturnValue({ uniqueHash: 'something' });
    const mockPayload = {
      browser_version: '1.0',
      os_version: '1.0',
    };

    const expectedResponse = {
      distinctId: 'hash',
      event: 'page_loaded',
      properties: {
        ...mockPayload,
        service: 'send',
      },
    };

    const response = await request(app)
      .post('/api/metrics/page-load')
      .send(mockPayload)
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer yayak')
      .set('Accept', 'application/json');

    expect(mockcapture).toBeCalledWith(expectedResponse);

    expect(response.status).toBe(200);
  });

  it('should capture metrics for logged users', async () => {
    vi.mock('@send-backend/middleware', () => {
      return {
        requireJWT: vi.fn().mockReturnValue('hash'),
      };
    });
    const mockedHash = 'mocked-email-hash';
    mockAuth.mockReturnValue({ uniqueHash: mockedHash });
    mockAuthenticatedRequest.mockReturnValue({ uniqueHash: mockedHash });

    const mockPayload = {
      browser_version: '1.0',
      os_version: '1.0',
    };

    const expectedResponse = {
      distinctId: mockedHash,
      event: 'page_loaded',
      properties: {
        ...mockPayload,
        service: 'send',
      },
    };

    const response = await request(app)
      .post('/api/metrics/page-load')
      .send(mockPayload)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer yayak');

    expect(mockcapture).toBeCalledWith(expectedResponse);

    expect(response.status).toBe(200);
  });

  it('only forwards allow-listed properties and drops arbitrary keys', async () => {
    mockcapture.mockClear();
    mockAuth.mockImplementation(() => {
      throw new Error('no token');
    });

    const mockPayload = {
      browser_version: '2.0',
      os_version: '3.0',
      path: '/share',
      page: 'share',
      // These must NOT leak through:
      email: 'evil@example.com',
      $set: { admin: true },
      random_junk: 'nope',
    };

    const response = await request(app)
      .post('/api/metrics/page-load')
      .send(mockPayload)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(mockcapture).toBeCalledWith({
      distinctId: 'hash',
      event: 'page_loaded',
      properties: {
        service: 'send',
        browser_version: '2.0',
        os_version: '3.0',
        path: '/share',
        page: 'share',
      },
    });

    const captured =
      mockcapture.mock.calls[mockcapture.mock.calls.length - 1][0];
    expect(Object.keys(captured.properties).sort()).toEqual(
      ['browser_version', 'os_version', 'page', 'path', 'service'].sort()
    );
    expect(captured.properties).not.toHaveProperty('email');
    expect(captured.properties).not.toHaveProperty('$set');
    expect(captured.properties).not.toHaveProperty('random_junk');
  });
});
