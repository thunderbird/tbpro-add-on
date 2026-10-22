import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseError } from '../../errors/models';
import {
  addErrorHandling,
  errorHandler,
  wrapAsyncHandler,
} from '../../errors/routes';

const ROUTE_ERROR = { statusCode: 500, message: 'Could not do the thing.' };
const NOT_FOUND = { statusCode: 404, message: 'Could not find the thing.' };

const app = express();
app.use(express.json({ limit: '1kb' }));
app.post(
  '/routed',
  addErrorHandling(ROUTE_ERROR, { THING_NOT_FOUND: NOT_FOUND }),
  wrapAsyncHandler(async (req) => {
    throw req.body.notFound
      ? new BaseError('THING_NOT_FOUND')
      : new Error('internal detail');
  })
);
app.post('/unrouted', () => {
  throw new Error('Invalid `prisma.user.findUnique()` invocation: secret-id');
});
app.use(errorHandler);

describe('errorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('uses the route message for a routed error', async () => {
    const res = await request(app).post('/routed').send({});
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      status: 'error',
      statusCode: 500,
      message: ROUTE_ERROR.message,
    });
  });

  it('applies a per-route override for a matching BaseError', async () => {
    const res = await request(app).post('/routed').send({ notFound: true });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 'error',
      statusCode: 404,
      message: NOT_FOUND.message,
    });
  });

  it('hides the message of an unrouted server error', async () => {
    const res = await request(app).post('/unrouted').send({});
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      status: 'error',
      statusCode: 500,
      message: 'Internal Server Error',
    });
  });

  it('keeps the status of a client error raised before the route', async () => {
    const malformed = await request(app)
      .post('/unrouted')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(malformed.status).toBe(400);
    expect(malformed.body.statusCode).toBe(400);

    const tooLarge = await request(app)
      .post('/unrouted')
      .send({ pad: 'x'.repeat(2048) });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.statusCode).toBe(413);
  });
});
