import { Router } from 'express';

const router: Router = Router();

/**
 * @openapi
 * /:
 *   get:
 *     tags:
 *       - Health
 *     summary: Server health check
 *     description: Simple endpoint to check if the server is alive
 *     responses:
 *       200:
 *         description: Returns an echo string
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: echo
 */
router.get('/', (_, res) => {
  res.status(200).send('echo');
});

/**
 * @openapi
 * /echo:
 *   get:
 *     tags:
 *       - Health
 *     summary: API echo endpoint
 *     description: Returns a JSON response to confirm API is functioning
 *     responses:
 *       200:
 *         description: Success response with message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: API echo response
 */
router.get('/echo', (_, res) => {
  res.status(200).json({ message: 'API echo response' });
});

/**
 * @openapi
 * /error:
 *   get:
 *     tags:
 *       - Debug
 *     summary: Simulate error
 *     description: Endpoint that simulates an error scenario for testing purposes
 *     responses:
 *       200:
 *         description: Success response with error simulation message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: API is simulating an error
 */
router.get('/error', (_, res) => {
  console.error('catching error on purpose');
  res.status(200).json({ message: 'API is simulating an error' });
});

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags:
 *       - Health
 *     summary: API health check
 *     description: Endpoint to check the health status of the API
 *     responses:
 *       200:
 *         description: Success response indicating API health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   type: string
 *                   example: API is alive
 */
router.get('/api/health', (_, res) => {
  res.status(200).json({
    session: 'API is alive',
  });
});

// Bugzilla 2064458: when Thunderbird refuses third-party cookies, the httpOnly
// SameSite=None session cookie (see auth/client.ts registerAuthToken) never
// reaches the backend and the entire app is non-functional. Pre-login there is
// no session to infer from, so the frontend performs a positive round-trip
// probe: `set` plants a throwaway cookie with the *same* SameSite=None; Secure
// attributes as the real session cookie, and `verify` reports whether it came
// back. Both routes are unauthenticated by design.
const COOKIE_PROBE_NAME = 'send_cookie_probe';
const COOKIE_PROBE_MAX_AGE_MS = 60_000;

/**
 * @openapi
 * /api/cookie-check/set:
 *   get:
 *     tags:
 *       - Health
 *     summary: Set the cookie probe
 *     description: >
 *       Sets a short-lived probe cookie with the same SameSite=None; Secure
 *       attributes as the session cookie, so the client can verify whether
 *       cookies for this backend are being blocked (Bugzilla 2064458).
 *     responses:
 *       200:
 *         description: Probe cookie set
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 */
router.get('/api/cookie-check/set', (_, res) => {
  res.cookie(COOKIE_PROBE_NAME, '1', {
    maxAge: COOKIE_PROBE_MAX_AGE_MS,
    // Matches the session cookie's attributes as closely as possible so the
    // probe faithfully tests the same blocking behavior.
    httpOnly: true,
    sameSite: 'none',
    secure: true,
  });
  res.status(200).json({ ok: true });
});

/**
 * @openapi
 * /api/cookie-check/verify:
 *   get:
 *     tags:
 *       - Health
 *     summary: Verify the cookie probe round-trip
 *     description: >
 *       Reports whether the probe cookie set by /api/cookie-check/set was sent
 *       back by the client, i.e. whether cookies for this backend are enabled
 *       (Bugzilla 2064458).
 *     responses:
 *       200:
 *         description: Probe result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cookiesEnabled:
 *                   type: boolean
 *                   example: true
 */
router.get('/api/cookie-check/verify', (req, res) => {
  res.status(200).json({
    cookiesEnabled: Boolean(req.cookies?.[COOKIE_PROBE_NAME]),
  });
});

export default router;
