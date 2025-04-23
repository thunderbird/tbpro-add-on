import { logger } from '@/utils/logger';
import { EventEmitter } from 'websocket';

export const loginEmitter = new EventEmitter();

loginEmitter.on('login_complete', () =>
  logger.log('Login complete event received')
);
loginEmitter.on('login_attempt', () =>
  logger.log('Login attempt event received')
);
loginEmitter.on('login_url_requested', () => logger.log('Login url requested'));
