import { constants } from 'tbpro-shared';
import { formatBytes } from './utils';

export const ERROR_MESSAGES = {
  SIZE_EXCEEDED: `Your upload exceeds the maximum upload size (${formatBytes(constants.MAX_FILE_SIZE)}). Please remove the oversized files and try again.`,
};
