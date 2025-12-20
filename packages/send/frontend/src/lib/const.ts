import prettyBytes from 'pretty-bytes';

export const CONTAINER_TYPE = {
  CONVERSATION: 'CONVERSATION',
  FOLDER: 'FOLDER',
};

export const ITEM_TYPE = {
  MESSAGE: 'MESSAGE',
  FILE: 'FILE',
};

export const POPUP_READY = 'POPUP_READY';
export const FILE_LIST = 'FILE_LIST';
export const ALL_UPLOADS_COMPLETE = 'ALL_UPLOADS_COMPLETE';
export const ALL_UPLOADS_ABORTED = 'ALL_UPLOADS_ABORTED';

export const FILE_SELECTED = 'FILE_SELECTED';
export const SELECTION_COMPLETE = 'SELECTION_COMPLETE';

const ONE_KB_IN_BYTES = 1000;
const ONE_MB_IN_BYTES = ONE_KB_IN_BYTES * 1000;
const ONE_GB_IN_BYTES = ONE_MB_IN_BYTES * 1000;

export const MAX_FILE_SIZE = ONE_GB_IN_BYTES * 20;
export const DAYS_TO_EXPIRY = 15;
export const MAX_FILE_SIZE_HUMAN_READABLE = prettyBytes(MAX_FILE_SIZE);

export const MAX_ACCESS_LINK_RETRIES = 5;
// We set the split size to 100 MB by default, but it can be overridden by an environment variable.
const SPLIT_SIZE_IN_MB: number = import.meta.env.VITE_SPLIT_SIZE_IN_MB || 100; // Default to 100 MB if not set
export const SPLIT_SIZE = SPLIT_SIZE_IN_MB * ONE_MB_IN_BYTES;

// Cache durations
const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;
export const FIFTEEN_MINUTES = 15 * ONE_MINUTE_IN_MILLISECONDS; // 15 minutes in milliseconds

export const PING = 'TB/PING';
export const BRIDGE_PING = 'APP/PING';
export const BRIDGE_READY = 'TB/BRIDGE_READY';
export const OIDC_USER = 'TB/OIDC_USER';
export const OIDC_TOKEN = 'TB/OIDC_TOKEN';
export const OIDC_LOAD = 'TB/OIDC_LOAD';
export const SIGN_IN = 'SIGN_IN';

export const STORAGE_KEY_AUTH = 'STORAGE_KEY_AUTH';
