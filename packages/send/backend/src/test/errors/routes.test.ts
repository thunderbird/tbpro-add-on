import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  addErrorHandling,
  errorHandler,
  wrapAsyncHandler,
} from '../../errors/routes';
import { captureConsole } from '../testutils';

/**
 * Regression for SonarCloud S5145 (log injection): the global error handler
 * logs the request method, URL, client IP and the error message. All of those
 * are client-influenced, so a request must not be able to smuggle a CR/LF
 * into the log and forge an extra line.
 */
describe('errorHandler logging', () => {
  let console_: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    console_ = captureConsole();
  });

  afterEach(() => {
    console_.restore();
  });

  function buildApp() {
    const app = express();
    app.get(
      '/boom',
      addErrorHandling({ statusCode: 500, message: 'Internal Server Error' }),
      wrapAsyncHandler(async () => {
        throw new Error('boom');
      })
    );
    app.get(
      '/echo',
      wrapAsyncHandler(async (req) => {
        // A handler that (unwisely) echoes request data into its error.
        throw new Error(`bad value: ${req.query.v}`);
      })
    );
    // errorHandler has a 3-arg signature; wrap it in the 4-arg error-middleware
    // shape so Express treats it as an error handler (see uploads tests).
    app.use((err, req, res, _next) => errorHandler(err, req, res));
    return app;
  }

  it('still responds with the status and message', async () => {
    const response = await request(buildApp()).get('/boom');
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      status: 'error',
      statusCode: 500,
      message: 'Internal Server Error',
    });
    expect(console_.output()).toContain('500 - GET /boom');
  });

  it('does not let CR/LF in the method, URL or IP forge a second log line', () => {
    // Node's HTTP parser percent-encodes a raw CR/LF in the request line, so
    // drive the handler directly with the values a proxy or a different
    // server stack could hand it.
    const req = {
      method: 'GET\r\nX',
      originalUrl: '/boom?x=1\r\n200 - GET /admin - 127.0.0.1 - ok',
      ip: '10.0.0.1\n',
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    errorHandler(new Error('db exploded\nfake line'), req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const lines = console_.output().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      '500 - GET  X /boom?x=1  200 - GET /admin - 127.0.0.1 - ok - 10.0.0.1  - db exploded fake line'
    );
  });

  it('does not let CR/LF echoed through the error message forge a log line', async () => {
    const forged = encodeURIComponent(
      'x\n404 - GET /forged - 1.2.3.4 - injected'
    );
    const response = await request(buildApp()).get(`/echo?v=${forged}`);
    expect(response.status).toBe(500);

    const lines = console_.output().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('bad value: x 404 - GET /forged');
  });
});
