import { JsonResponse } from '@send-frontend/lib/api';
import { NamedBlob } from '@send-frontend/types';
import JSZip from 'jszip';
import { MAX_FILE_SIZE } from './const';
import { trpc } from './trpc';

/**
 * Generates a SHA-256 hash from a file blob.
 *
 * @param {Blob} fileBlob - The file blob to hash
 * @returns {Promise<string>} - Returns a Promise that resolves to the hexadecimal hash string
 */
export async function generateFileHash(fileBlob: Blob): Promise<string> {
  const fileArrayBuffer = await fileBlob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fileHash = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return fileHash;
}

/*
 * Checks if user can continue uploading based on current storage usage and limit
 * @param {number} currentUploadSize - Size of the upload in bytes
 * @returns {boolean} - Returns true if user can upload, false otherwise
 */
export async function canUserUpload(
  currentUploadSize: number
): Promise<boolean> {
  // check if user would exceed storage limit with this upload
  const { active, limit } = await trpc.getTotalUsedStorage.query();
  return active + currentUploadSize >= limit;
}

/**
 * Returns a promise that resolves after an amount of time has passed.
 *
 * @param { number } delayMs - number of milliseconds that must pass before the promise resolves
 */
export function delay(delayMs = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Runs a function at an interval until it succeeds or the maximum wait time is reached.
 *
 * @param {function(): any} fn - The function to retry. Function can be `async`.
 * @param {number} waitTimeMs - How long to wait between each retry.
 * @param {number} maxWaitTimeMs - The maximum amount of time to retry until we give up.
 */
export async function retryUntilSuccessOrTimeout(
  fn: () => Promise<boolean>,
  waitTimeMs: number = 1_000,
  maxWaitTimeMs: number = 60_000
): Promise<void> {
  for (
    let waitTotalMs = 0;
    waitTotalMs < maxWaitTimeMs;
    waitTotalMs += waitTimeMs
  ) {
    await delay(waitTimeMs);
    try {
      const result: boolean = await fn();
      // Stop retrying if the function returns a truthy value
      if (!!result) return;
    } catch (e) {
      console.error(
        `Error on waiting for the file to show up in storage: ${e}`
      );
    }
  }
}

export function calculateTimeout(
  fileSizeMb: number,
  uploadSpeedMbps: number,
  buffer: number = 1.25
): number {
  const uploadSpeedMBps = uploadSpeedMbps / 8;
  const uploadTime = fileSizeMb / uploadSpeedMBps;
  return Math.ceil(uploadTime * buffer); // Returns the timeout in seconds with buffer
}

export async function streamToArrayBuffer(
  stream: ReadableStream,
  size?: number
): Promise<ArrayBufferLike> {
  const reader = stream.getReader();
  let state = await reader.read();

  if (size) {
    const result = new Uint8Array(size);
    let offset = 0;
    while (!state.done) {
      result.set(state.value, offset);
      offset += state.value.length;
      state = await reader.read();
    }
    return result.buffer;
  }

  const parts = [];
  let len = 0;
  while (!state.done) {
    parts.push(state.value);
    len += state.value.length;
    state = await reader.read();
  }
  let offset = 0;
  const result = new Uint8Array(len);
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result.buffer;
}

export function timestamp(): number {
  return new Date().getTime();
}

class ConnectionError extends Error {
  canceled: boolean;
  duration: number;
  size: number;
  constructor(canceled: boolean, duration?: number, size?: number) {
    super(canceled ? '0' : 'connection closed');
    this.canceled = canceled;
    this.duration = duration;
    this.size = size;
  }
}

export function asyncInitWebSocket(serverUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(serverUrl);
      ws.addEventListener('open', () => resolve(ws), { once: true });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      reject(new ConnectionError(false));
    }
  });
}

export async function connectToWebSocketServer(
  serverUrl: string
): Promise<WebSocket> {
  const ws = new WebSocket(serverUrl);
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (ws.readyState === 1) {
        clearInterval(timer);
        resolve(ws);
      }
    }, 10);
  });
}

export async function listenForResponse(
  ws: WebSocket,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canceler: Record<string, any>
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    function handleClose() {
      // a 'close' event before a 'message' event means the request failed
      ws.removeEventListener('message', handleMessage);
      reject(new ConnectionError(canceler.canceled));
    }
    function handleMessage(msg: MessageEvent) {
      ws.removeEventListener('close', handleClose);
      try {
        const response = JSON.parse(msg.data);
        if (response.error) {
          throw new Error(response.error);
        } else {
          resolve(response);
        }
      } catch (e) {
        reject(e);
      }
    }
    ws.addEventListener('message', handleMessage, { once: true });
    ws.addEventListener('close', handleClose, { once: true });
  });
}

// https://gist.github.com/zentala/1e6f72438796d74531803cc3833c039c
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes == 0) return '0 Bytes';
  const k = 1024,
    dm = decimals,
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export async function zipBlob(blob: Blob, filename: string) {
  const zip = new JSZip();
  zip.file(filename, blob);

  return zip.generateAsync({ type: 'blob' });
}

export async function unzipArrayBuffer(
  arrayBuffer: ArrayBufferLike
): Promise<ArrayBuffer> {
  try {
    const zip = new JSZip();
    // Convert ArrayBufferLike to ArrayBuffer if needed
    const buffer =
      arrayBuffer instanceof ArrayBuffer
        ? arrayBuffer
        : new ArrayBuffer(arrayBuffer.byteLength);
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      new Uint8Array(buffer).set(new Uint8Array(arrayBuffer));
    }

    const zipData = await zip.loadAsync(buffer);

    // Get the first file from the zip (assuming single file per zip for this implementation)
    const fileNames = Object.keys(zipData.files);
    if (fileNames.length === 0) {
      throw new Error('No files found in zip archive');
    }

    // Take the first file (or we could implement logic to find the main file)
    const fileName = fileNames[0];
    const file = zipData.files[fileName];

    if (file.dir) {
      throw new Error('Expected file but found directory in zip archive');
    }

    // Extract the file content as ArrayBuffer
    const content = await file.async('arraybuffer');
    return content;
  } catch (error) {
    console.error('Error unzipping content:', error);
    // If unzipping fails, return the original content (might not be zipped)
    // Convert ArrayBufferLike to ArrayBuffer for consistent return type
    if (arrayBuffer instanceof ArrayBuffer) {
      return arrayBuffer;
    } else {
      const buffer = new ArrayBuffer(arrayBuffer.byteLength);
      new Uint8Array(buffer).set(new Uint8Array(arrayBuffer));
      return buffer;
    }
  }
}

export async function unzipMultipartPiece(
  arrayBuffer: ArrayBufferLike
): Promise<{
  content: ArrayBuffer;
  isMultipart: boolean;
  partNumber?: number;
}> {
  try {
    const zip = new JSZip();
    // Convert ArrayBufferLike to ArrayBuffer if needed
    const buffer =
      arrayBuffer instanceof ArrayBuffer
        ? arrayBuffer
        : new ArrayBuffer(arrayBuffer.byteLength);
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      new Uint8Array(buffer).set(new Uint8Array(arrayBuffer));
    }

    const zipData = await zip.loadAsync(buffer);

    // Get the files from the zip
    const fileNames = Object.keys(zipData.files);
    if (fileNames.length === 0) {
      throw new Error('No files found in zip archive');
    }

    // Look for multipart file or take the first file
    const targetFileName = fileNames[0];
    const isMultipart = false;
    let partNumber: number | undefined;

    const file = zipData.files[targetFileName];

    if (file.dir) {
      throw new Error('Expected file but found directory in zip archive');
    }

    // Extract the file content as ArrayBuffer
    const content = await file.async('arraybuffer');
    return { content, isMultipart, partNumber };
  } catch (error) {
    console.error('Error unzipping multipart content:', error);
    // If unzipping fails, return the original content (might not be zipped)
    const buffer =
      arrayBuffer instanceof ArrayBuffer
        ? arrayBuffer
        : new ArrayBuffer(arrayBuffer.byteLength);
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      new Uint8Array(buffer).set(new Uint8Array(arrayBuffer));
    }
    return { content: buffer, isMultipart: false };
  }
}

export const formatBlob = async (blob: NamedBlob): Promise<NamedBlob> => {
  if (blob.type === '') {
    const zippedBlob = await zipBlob(blob, blob.name);
    const compressedBlob = new Blob([zippedBlob], {
      type: 'application/zip',
    }) as NamedBlob;
    compressedBlob.name = `${blob.name}.zip`;
    return compressedBlob;
  }
  return blob;
};

export const splitIntoMultipleZips = async (
  blob: NamedBlob,
  maxSize: number
): Promise<NamedBlob[]> => {
  const chunks: NamedBlob[] = [];

  // If the blob is smaller than maxSize, return it as a single zip
  if (blob.size <= maxSize) {
    const singleZip = await zipBlob(blob, blob.name);
    const zippedBlob = new Blob([singleZip], {
      type: 'application/zip',
    }) as NamedBlob;
    zippedBlob.name = `${blob.name}`;
    return [zippedBlob];
  }

  // Split the blob into chunks
  const totalSize = blob.size;
  const numChunks = Math.ceil(totalSize / maxSize);

  for (let i = 0; i < numChunks; i++) {
    const start = i * maxSize;
    const end = Math.min(start + maxSize, totalSize);

    // Create a chunk from the original blob
    const chunk = blob.slice(start, end);
    const chunkBlob = new Blob([chunk], { type: blob.type }) as NamedBlob;
    chunkBlob.name = `${blob.name}`;

    // Zip the chunk
    const zippedChunk = await zipBlob(chunkBlob, chunkBlob.name);
    const zippedBlob = new Blob([zippedChunk], {
      type: 'application/zip',
    }) as NamedBlob;
    zippedBlob.name = `${chunkBlob.name}`;

    chunks.push(zippedBlob);
  }

  return chunks;
};

export const checkBlobSize = async (blob: NamedBlob) => {
  console.log(blob);
  if (blob.size > MAX_FILE_SIZE) {
    console.warn('File too big');
    return false;
  }
  return true;
};

export const getDaysUntilDate = (date: Date | string): number => {
  const targetDate = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  const result = Math.ceil(diff / (1000 * 3600 * 24));
  return !result || result < 0 ? 0 : result;
};

export const getAccessLinkWithoutPasswordHash = (link: string): string => {
  if (link.includes('#')) {
    return link.split('#')[0];
  }
  return link;
};

export type ExpirationOption =
  | 'never'
  | '24hours'
  | '14days'
  | '30days'
  | 'custom';

export function getExpirationDate(
  selectedExpiration: ExpirationOption,
  customDateTime: string
): string | undefined {
  const now = new Date();

  switch (selectedExpiration) {
    case 'never':
      return undefined;
    case '24hours':
      now.setHours(now.getHours() + 24);
      return now.toISOString();
    case '14days':
      now.setDate(now.getDate() + 14);
      return now.toISOString();
    case '30days':
      now.setDate(now.getDate() + 30);
      return now.toISOString();
    case 'custom':
      // datetime-local input provides value in format: YYYY-MM-DDTHH:mm
      if (!customDateTime) return undefined;
      try {
        const date = new Date(customDateTime);
        return date.toISOString();
      } catch (error) {
        console.error('Failed to parse custom date/time:', error);
        return undefined;
      }
    default:
      return undefined;
  }
}
