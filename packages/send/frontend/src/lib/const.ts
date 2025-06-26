import prettyBytes from 'pretty-bytes';

export const CONTAINER_TYPE = {
  CONVERSATION: 'CONVERSATION',
  FOLDER: 'FOLDER',
};

export const ITEM_TYPE = {
  MESSAGE: 'MESSAGE',
  FILE: 'FILE',
};

export const EXTENSION_READY = 'EXTENSION_READY';
export const SHARE_COMPLETE = 'SHARE_COMPLETE';
export const SHARE_ABORTED = 'SHARE_ABORTED';

export const FILE_SELECTED = 'FILE_SELECTED';
export const SELECTION_COMPLETE = 'SELECTION_COMPLETE';

const ONE_KB_IN_BYTES = 1024;
const ONE_MB_IN_BYTES = ONE_KB_IN_BYTES * 1024;
const ONE_GB_IN_BYTES = ONE_MB_IN_BYTES * 1024;

export const MAX_FILE_SIZE = ONE_GB_IN_BYTES * 20;
export const DAYS_TO_EXPIRY = 15;
export const MAX_FILE_SIZE_HUMAN_READABLE = prettyBytes(MAX_FILE_SIZE);

export const MAX_ACCESS_LINK_RETRIES = 5;
// We set the split size to 100 MB by default, but it can be overridden by an environment variable.
const SPLIT_SIZE_IN_MB: number = import.meta.env.VITE_SPLIT_SIZE_IN_MB || 100; // Default to 100 MB if not set
export const SPLIT_SIZE = SPLIT_SIZE_IN_MB * ONE_MB_IN_BYTES;
