import { requireJWT } from '@send-backend/middleware';
import {
  cleanupExpiredVerificationCodes,
  generateVerificationCode,
  getVerificationByCode,
} from '@send-backend/models/verification';
import { verificationEmitter } from '@send-backend/ws/verify';
import { Router } from 'express';

const router: Router = Router();

/*
 * This endpoint is used to verify a code entered by the user.
 * It checks if the code is valid and emits an event if it is.
 */
router.post('', requireJWT, async (req, res) => {
  // Check that the verification code entered is valid
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  // Check the database for a matching code (only within the last minute)
  const responseCode = await getVerificationByCode(code);
  if (!responseCode) {
    return res.status(404).json({
      error:
        'Verification code not found or expired. Please request a new code.',
    });
  }

  // If the code is valid, emit an event to notify the client
  // that the verification is complete
  if (responseCode.id) {
    verificationEmitter.emit('verification_complete', {
      code: responseCode.id,
    });
  }

  return res.json({ message: 'Step 2: Verification complete' });
});

/*
 * This endpoint is used to generate a new verification code.
 * It cleans up expired codes first and then generates a new one.
 */
router.get('/generate', requireJWT, async (req, res) => {
  // Clean up expired codes first
  await cleanupExpiredVerificationCodes();

  const { code, createdAt } = await generateVerificationCode();

  return res.json({
    message: 'Verification code generated complete',
    code,
    createdAt,
  });
});

/*
 * This endpoint is used to request a verification code. It receives the UUID of the client
 * it emits an event to notify the client that a verification code has been requested.
 */
router.get('/request', requireJWT, async (req, res) => {
  const { code } = req.query;
  verificationEmitter.emit('verification_requested', { code });
  return res.json({ message: 'Verification requested', code });
});

export default router;
