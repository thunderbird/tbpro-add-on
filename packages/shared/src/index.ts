// This file makes it easier to import shared modules
import logger from './logger';

// Import the tsconfig base to ensure it gets copied to dist during compilation
import tsconfigBase from '../tsconfig.client.base.json';

export { logger, tsconfigBase };

// add a default export to avoid issues with some bundlers
export default {
  logger,
  tsconfigBase,
};
