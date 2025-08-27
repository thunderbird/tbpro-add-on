// This file makes it easier to import shared modules
import logger from './logger';

// Import the tsconfig base to ensure it gets copied to dist during compilation
import tsconfigBase from '../tsconfig.client.base.json';
import { useAuth } from './auth/auth';
import * as validations from './lib/validations';
import { default as useApiStore } from './stores/api-store';
import { useAuthStore } from './stores/auth-store';
import * as types from './types';

export {
  logger,
  tsconfigBase,
  types,
  useApiStore,
  useAuth,
  useAuthStore,
  validations,
};

// add a default export to avoid issues with some bundlers
export default {
  logger,
  tsconfigBase,
  types,
  useApiStore,
  useAuth,
  useAuthStore,
  validations,
};
