import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import router from '../../routes';

// Mirrors the real app: cookieParser is applied app-wide (src/index.ts) and the
// index router is mounted at '/'. These routes need no DB, auth or storage.
const app = express();
app.use(cookieParser());
app.use('/', router);

/**
 * Bugzilla 2064458: pre-login there is no session to infer blocked cookies
 * from, so the frontend runs a positive round-trip probe against these two
 * unauthenticated routes. The probe cookie must carry the same SameSite=None;
 * Secure attributes as the real session cookie (auth/client.ts
 * registerAuthToken) or it would not test the same blocking behavior — the
 * attribute assertions below pin that.
 */
describe('GET /api/cookie-check', () => {
  it('set plants the probe cookie with the session cookie attributes', async () => {
    const response = await request(app).get('/api/cookie-check/set');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers['cache-control']).toBe('no-store');

    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const probeCookie = [setCookie]
      .flat()
      .find((cookie) => cookie.startsWith('send_cookie_probe='));
    expect(probeCookie).toBeDefined();
    // Same attributes as the real session cookie, so the probe faithfully
    // tests the same blocking behavior.
    expect(probeCookie).toContain('SameSite=None');
    expect(probeCookie).toContain('Secure');
    expect(probeCookie).toContain('HttpOnly');
  });

  it('verify answers cookiesEnabled:true when the probe cookie comes back', async () => {
    const response = await request(app)
      .get('/api/cookie-check/verify')
      .set('Cookie', 'send_cookie_probe=1');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ cookiesEnabled: true });
  });

  it('verify answers cookiesEnabled:false when no probe cookie arrives', async () => {
    const response = await request(app).get('/api/cookie-check/verify');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ cookiesEnabled: false });
  });
});
