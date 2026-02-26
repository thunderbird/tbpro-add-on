import { logger } from '@send-backend/utils/logger';
import { EventEmitter } from 'events';

export const verificationEmitter = new EventEmitter();

verificationEmitter.on('verification_complete', () =>
  logger.log('Verification complete event received')
);
verificationEmitter.on('verification_attempt', () =>
  logger.log('Verification attempt event received')
);
verificationEmitter.on('verification_requested', () =>
  logger.log('Verification requested')
);

verificationEmitter.on('shared_passphrase', () =>
  console.log('Shared passphrase event received')
);
