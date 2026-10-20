// Express only treats middleware with exactly four parameters as an error
// handler; with fewer it is skipped on the error path and the default
// finalhandler responds instead.
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import {
  addErrorHandling,
  errorHandler,
  wrapAsyncHandler,
} from '../../errors/routes';

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '20b' }));
  app.get(
    '/configured',
    addErrorHandling({ statusCode: 404, message: 'x' }),
    wrapAsyncHandler(async () => {
      throw new Error('boom');
    })
  );
  app.get(
    '/unconfigured',
    wrapAsyncHandler(async () => {
      throw new Error('internal detail');
    })
  );
  app.post('/body', (_req, res) => {
    res.json({ ok: true });
  });
  // Stand-in for Sentry's error middleware, registered just before ours in
  // index.ts: it records the error and forwards it with next(err).
  app.use((err: Error, _req: Request, _res: Response, next: NextFunction) =>
    next(err)
  );
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  it('is registered as error middleware (four parameters)', () => {
    expect(errorHandler.length).toBe(4);
  });

  it('responds with the status and message set by addErrorHandling', async () => {
    const res = await request(buildApp()).get('/configured');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 'error',
      statusCode: 404,
      message: 'x',
    });
  });

  it('falls back to a generic 500 without leaking the error message', async () => {
    const res = await request(buildApp()).get('/unconfigured');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      status: 'error',
      statusCode: 500,
      message: 'Internal Server Error',
    });
  });

  it.each([
    ['malformed JSON', '{bad', 400],
    ['an oversized body', JSON.stringify({ a: 'x'.repeat(50) }), 413],
  ])('keeps the body parser status for %s', async (_label, body, status) => {
    const res = await request(buildApp())
      .post('/body')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ status: 'error', statusCode: status });
  });
});
