import useFolderStore, {
  FolderStore,
} from '@send-frontend/apps/send/stores/folder-store';
import { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { INIT_ERRORS } from '@send-frontend/apps/send/const';
import init from '@send-frontend/lib/init';
import { UserStoreType } from '@send-frontend/stores/user-store';
import config from '@send-frontend/config';

import { RouteLocationNormalized } from 'vue-router';
import { encryptStream } from './ece';
import { Keychain } from './keychain';

type DownloadOptions = {
  url?: string;
  id?: string;
  progressTracker: ProgressTracker;
};

export async function _download({
  url,
  progressTracker,
  id,
}: DownloadOptions): Promise<Blob> {
  const endpoint = `${config.sendServerUrl}/api/download`;
  const xhr = new XMLHttpRequest();
  const { setProgress } = progressTracker;
  xhr.onprogress = (event) => {
    if (event.lengthComputable) {
      const downloadProgress = event.loaded;
      setProgress(downloadProgress);
    }
  };

  return new Promise((resolve, reject) => {
    xhr.addEventListener('loadend', async function () {
      if (xhr.status !== 200) {
        return reject(new Error(`${xhr.status}`));
      }
      const blob = new Blob([xhr.response]);
      resolve(blob);
    });
    // The id is used when the backend is using fs
    // Url is used when the backend is using s3
    xhr.open('get', id ? `${endpoint}/${id}` : url);
    xhr.responseType = 'blob';
    xhr.send();
  });
}

export async function encrypt(
  stream: ReadableStream,
  key: CryptoKey
): Promise<Uint8Array> {
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    // Intentionally omitting `await` so that the encrypt & upload
    // finishes before we read the response from the server.

    if (key) {
      stream = encryptStream(stream, key);
    }

    const reader = stream.getReader();
    let state = await reader.read();

    while (!state.done) {
      const buf = state.value;
      chunks.push(buf);

      // Don't update progress during encryption - only during actual upload
      // progressTracker.setProgress(size);

      size += buf.length;
      console.info('Encrypted', size, 'bytes', '- timestamp:', Date.now());
      state = await reader.read();
    }
    const concatenated = concatenateUint8Arrays(chunks);
    return concatenated;
  } catch (e) {
    console.error(e);
  }
}

function concatenateUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, value) => acc + value.length, 0);
  const result = new Uint8Array(totalLength);
  let length = 0;

  for (const array of arrays) {
    result.set(array, length);
    length += array.length;
  }

  return result;
}

// After mozilla account login, confirm that
// - we have a db user
// - the user has a public key
// - the user has a default folder for email attachments
export async function dbUserSetup(
  userStore: UserStoreType,
  keychain: Keychain,
  folderStore: FolderStore | ReturnType<typeof useFolderStore>
) {
  // Populate the user if they exist
  const didPopulate = await userStore.populateFromBackend();
  if (!didPopulate) {
    return;
  }
  // Store the user we got by populating from session.
  await userStore.store();

  // Check if the user has a public key.
  // If not, this is almost certainly a new user.
  const publicKey = await userStore.getPublicKey();
  if (!publicKey) {
    await keychain.rsa.generateKeyPair();
    await keychain.store();

    const jwkPublicKey = await keychain.rsa.getPublicKeyJwk();
    const didUpdate = await userStore.updatePublicKey(jwkPublicKey);
    if (!didUpdate) {
      console.warn(`DEBUG: could not update user's public key`);
    }
  }

  // When we call `init()`, it takes care of:
  // - loading user from storage
  // - loading keychain from storage
  // - creating the default folder
  const initResult = await init(userStore, keychain, folderStore);
  if (initResult !== INIT_ERRORS.NONE) {
    console.error(
      `User setup incomplete — init() returned error: ${Object.keys(INIT_ERRORS)[initResult]}`
    );
  }
}

/* This function is a short hand to get the meta records from the route */
export const matchMeta = (to: RouteLocationNormalized, key: string) => {
  return to.matched.some((record) => record.meta[key]);
};

type UploadOptions = {
  url: string;
  readableStream: ReadableStream;
  progressTracker: ProgressTracker;
  // When aborted, the in-flight PUT is cancelled and no further retries run.
  // Used to cancel sibling parts once a multipart upload is known to be doomed.
  signal?: AbortSignal;
};

// Thrown when a PUT is cancelled via the AbortSignal. Distinct from a transient
// failure so the retry loop knows not to retry it.
export const UPLOAD_ABORTED = 'UPLOAD_ABORTED';

// Upload PUT retry policy. The hard B2 failures seen in production
// (Sentry SEND-SUITE-FRONTEND-24H) are multi-minute stalls, so we retry a
// handful of times with exponentially-growing, jittered delays to widen the
// recovery window before giving up. Defaults are overridable per environment
// via APP_UPLOAD_HTTP_RETRY_* (container runtime config) or the corresponding
// VITE_* vars (baked, for dev / the S3 build / the add-on XPI) -- note these are
// read once at module load, so a change still needs a pod restart or a rebuild;
// they exist for tuning, not live reconfiguration.
// UPLOAD_HTTP_RETRY_LIMIT is the number of *retries*; total attempts is
// limit + 1 (default 3 retries => 4 attempts).
export const UPLOAD_HTTP_RETRY_LIMIT: number =
  Number(config.uploadHttpRetryLimit) || 3;
export const UPLOAD_HTTP_RETRY_BASE_DELAY_MS: number =
  Number(config.uploadHttpRetryBaseDelayMs) || 1000;

/**
 * Exponential backoff with jitter for the upload PUT retry schedule:
 *   delay = base * 2^attempt * (0.5 + Math.random() / 2)
 * The jitter factor is in [0.5, 1.0), so with the default 1000ms base the
 * per-attempt delays grow roughly ~1s, ~2s, ~4s while staying de-synchronized
 * across clients (avoids a thundering herd when B2 recovers).
 *
 * @param attempt - zero-based index of the attempt that just failed
 * @param baseDelayMs - base delay; defaults to UPLOAD_HTTP_RETRY_BASE_DELAY_MS
 */
export function getUploadRetryDelayMs(
  attempt: number,
  baseDelayMs: number = UPLOAD_HTTP_RETRY_BASE_DELAY_MS
): number {
  const exponential = baseDelayMs * 2 ** attempt;
  const jitter = 0.5 + Math.random() / 2; // [0.5, 1.0)
  // floor (not round) keeps each attempt's range strictly below the next's
  // floor: [base*2^a*0.5, base*2^a), so successive delays never collide.
  return Math.floor(exponential * jitter);
}

export const uploadWithTracker = ({
  url,
  readableStream,
  progressTracker,
  signal,
}: UploadOptions) => {
  const { setProgress } = progressTracker;
  const XHR_TIMEOUT_MS = 180000;

  const attemptPut = (blob: Blob, attempt: number): Promise<string> => {
    // Bail out immediately if a sibling part already failed and aborted us.
    if (signal?.aborted) {
      return Promise.reject(new Error(UPLOAD_ABORTED));
    }

    // Reset progress on retry so the UI gets a clean signal
    // rather than silently jumping backwards
    if (attempt > 0) {
      setProgress(0);
    }

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.timeout = XHR_TIMEOUT_MS;

      const onAbort = () => xhr.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const cleanup = () => signal?.removeEventListener('abort', onAbort);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          // For multipart uploads, the progress tracker will handle the proper calculation
          const uploadProgress = event.loaded;
          setProgress(uploadProgress);
        }
      };

      xhr.onload = () => {
        cleanup();
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          console.error('Upload failed:');
          reject(new Error('UPLOAD_FAILED'));
        }
      };

      xhr.onabort = () => {
        cleanup();
        reject(new Error(UPLOAD_ABORTED));
      };
      xhr.onerror = () => {
        cleanup();
        reject(new Error('XHR: UPLOAD_FAILED'));
      };
      xhr.ontimeout = () => {
        cleanup();
        reject(new Error(`Upload timed out after ${XHR_TIMEOUT_MS / 1000}s`));
      };

      xhr.send(blob);
    }).catch((error) => {
      // Never retry an abort — it means the whole upload has been cancelled.
      const aborted = signal?.aborted || error?.message === UPLOAD_ABORTED;
      if (!aborted && attempt < UPLOAD_HTTP_RETRY_LIMIT) {
        const delayMs = getUploadRetryDelayMs(attempt);
        console.warn(
          `HTTP PUT attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`,
          error.message
        );
        return new Promise<string>((resolve) =>
          setTimeout(resolve, delayMs)
        ).then(() => attemptPut(blob, attempt + 1));
      }
      throw error;
    });
  };

  // Convert ReadableStream to Blob and send with HTTP-level retries
  return new Response(readableStream).blob().then((uploadBlob) => {
    return attemptPut(uploadBlob, 0);
  });
};

export const getDaysToExpiryText = (daysToExpiry: number) => {
  if (daysToExpiry === 1) {
    return `Expires in ${daysToExpiry} day`;
  }
  return `Expires in ${daysToExpiry} days`;
};
