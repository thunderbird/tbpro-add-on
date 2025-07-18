/* eslint-disable @typescript-eslint/no-explicit-any */
import { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { decryptStream } from '@send-frontend/lib/ece';
import {
  _download,
  _upload,
  calculateEncryptedSize,
  encrypt,
  uploadWithTracker,
} from '@send-frontend/lib/helpers';
import { blobStream } from '@send-frontend/lib/streams';
import { streamToArrayBuffer } from '@send-frontend/lib/utils';
import { ApiConnection } from './api';

export type NamedBlob = Blob & { name: string };

export type Canceler = Record<string, () => void>;

interface SaveFileData {
  plaintext: ArrayBuffer;
  name: string;
  type: string;
}

export async function _saveFile(file: SaveFileData): Promise<void> {
  return new Promise(function (resolve) {
    const dataView = new DataView(file.plaintext);
    const blob = new Blob([dataView], { type: file.type });

    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      resolve();
    }, 0);
  });
}

export async function downloadTxt(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }, 0);
}

export async function getBlob(
  id: string,
  size: number,
  key: CryptoKey,
  isBucketStorage = true,
  filename = 'dummy.file',
  type = 'text/plain',
  api: ApiConnection,
  progressTracker: ProgressTracker
): Promise<string | void> {
  if (!isBucketStorage) {
    const downloadedBlob = await _download({ id, progressTracker });

    let plaintext: ArrayBufferLike | string;
    if (key) {
      const plainStream = decryptStream(blobStream(downloadedBlob), key);
      plaintext = await streamToArrayBuffer(plainStream, size);
    } else {
      plaintext = await downloadedBlob.arrayBuffer();
    }

    return await _saveFile({
      plaintext: plaintext as ArrayBuffer,
      name: decodeURIComponent(filename),
      type, // mime type of the upload
    });
  }

  try {
    const bucketResponse = await api.call<{ url: string }>(
      `download/${id}/signed`
    );

    if (!bucketResponse?.url) {
      throw new Error('BUCKET_URL_NOT_FOUND');
    }

    progressTracker.setUploadSize(size);
    progressTracker.setText('Downloading file');

    const downloadedBlob = await _download({
      url: bucketResponse.url,
      progressTracker,
    });

    let plaintext: ArrayBufferLike | string;
    if (key) {
      const plainStream = decryptStream(blobStream(downloadedBlob), key);
      plaintext = await streamToArrayBuffer(plainStream, size);
    } else {
      plaintext = await downloadedBlob.arrayBuffer();
    }

    return await _saveFile({
      plaintext: plaintext as ArrayBuffer,
      name: decodeURIComponent(filename),
      type, // mime type of the upload
    });
  } catch (error) {
    console.error('DOWNLOAD_FAILED', error);
    throw error;
  }
}

export async function sendBlob(
  blob: Blob,
  aesKey: CryptoKey,
  api: ApiConnection,
  progressTracker: ProgressTracker,
  isBucketStorage = true
): Promise<string> {
  const stream = blobStream(blob);
  if (!isBucketStorage) {
    const encryptedSize = calculateEncryptedSize(blob.size);
    const result = await _upload(stream, aesKey, encryptedSize, {
      progressTracker,
    });

    // Using a type guard since a JsonResponse can be a single object or an array
    if (Array.isArray(result)) {
      return result[0].id;
    } else {
      return result.id;
    }
  }

  try {
    // Get the bucket url
    const { id, url } = await api.call<{ url: string; id: string }>(
      'uploads/signed',
      {
        type: 'application/octet-stream',
      },
      'POST'
    );

    progressTracker.setProcessStage('encrypting');
    progressTracker.setText('Encrypting file');
    const encrypted = await encrypt(stream, aesKey);

    // Don't reset progress to 0 - maintain the encryption progress
    // and continue from where we left off for upload
    progressTracker.setProcessStage('uploading');
    progressTracker.setText('Uploading file');

    // Create a ReadableStream from the Uint8Array
    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encrypted);
        controller.close();
      },
    });

    await uploadWithTracker({
      url,
      readableStream,
      progressTracker,
    });
    return id;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    throw new Error('UPLOAD_FAILED');
  }
}

interface SaveFileStreamData {
  stream: ReadableStream<Uint8Array>;
  name: string;
  type: string;
}

export async function _saveFileStream(file: SaveFileStreamData): Promise<void> {
  // Check if File System Access API is available for truly streaming saves
  if ('showSaveFilePicker' in window) {
    try {
      const fileHandle = await (
        window as { showSaveFilePicker: (options: any) => Promise<any> }
      ).showSaveFilePicker({
        suggestedName: file.name,
        types: [
          {
            description: file.type,
            accept: { [file.type]: [] },
          },
        ],
      });

      const writable = await fileHandle.createWritable();
      const reader = file.stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }

      await writable.close();
      return;
    } catch (error) {
      // Fall back to traditional approach if user cancels or API fails
      console.warn(
        'File System Access API failed, falling back to blob approach:',
        error
      );
    }
  }

  // Fallback: Use Response to create blob (still more memory efficient than ArrayBuffer approach)
  // This is necessary for browsers that don't support File System Access API
  const response = new Response(file.stream);
  const blob = await response.blob();

  // Create a blob with the correct type
  const typedBlob = new Blob([blob], { type: file.type });

  return new Promise(function (resolve) {
    const downloadUrl = URL.createObjectURL(typedBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      resolve();
    }, 0);
  });
}
