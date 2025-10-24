import { MAX_FILE_SIZE } from './const';
import { formatBytes } from './utils';

export const ERROR_MESSAGES = {
  SIZE_EXCEEDED: `Your upload exceeds the maximum upload size (${formatBytes(MAX_FILE_SIZE)}). Please remove the oversized files and try again.`,
};

export const STORAGE_LIMIT_EXCEEDED =
  'You have exceeded your storage limit. Please remove files to continue uploading. Try re opening this page after freeing up space.';
