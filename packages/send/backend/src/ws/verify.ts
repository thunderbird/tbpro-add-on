import { logger } from '@send-backend/utils/logger';
import { EventEmitter } from 'websocket';

export const verificationEmitter = new EventEmitter();

verificationEmitter.on('verification_attempt', () =>
  logger.log('Verification attempt event received')
);

verificationEmitter.on('verification_requested', (e) => {
  logger.log('Verification requested');
  logger.log('Step 1: Verification  event data:', JSON.stringify(e));
});

verificationEmitter.on('verification_complete', (e) => {
  logger.log('Verification complete event received');
  logger.log('Step 2: Verification complete event data:', JSON.stringify(e));
});

verificationEmitter.on('shared_passphrase', (e) => {
  console.log('Shared passphrase event data:', e);
  console.log('Step 3: Shared passphrase data:', JSON.stringify(e));
});
