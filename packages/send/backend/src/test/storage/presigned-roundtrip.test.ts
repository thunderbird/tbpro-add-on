import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  StorageAdapterConfig,
  StorageType,
} from '@tweedegolf/storage-abstraction';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileStore } from '../../storage';
import { createS3Client } from '../../storage/s3b2';
import { NETWORK_TEST_TIMEOUT_MS, isMinioReachable } from '../testutils';

/**
 * The upload and download path that production actually takes.
 *
 * On a bucket deployment the browser never reaches `FileStore.set()` or
 * `.get()`. It asks the backend for a presigned URL (`POST /api/uploads/signed`
 * -> `getUploadBucketUrl`, `GET /api/download/:id/signed` ->
 * `getDownloadBucketUrl`) and moves the bytes itself, straight to the bucket.
 * The backend only reads the object's size back, to gate the database row
 * (`createUpload` -> `length`), and deletes it later (`deleteUploadsByIds` ->
 * `del`). Those four calls are the production surface, so they are what this
 * suite exercises -- against a real bucket service, over real HTTP.
 *
 * The service is MinIO, so the round trip runs on a laptop and in CI without
 * credentials for anyone's live bucket. B2's own behaviour is covered by
 * `end-to-end-bucket-tests`, which drives the whole stack against Backblaze.
 *
 * A bucket costs nothing to start, so this suite does not skip when one is
 * missing -- it fails and says how to start it. A storage suite that quietly
 * does not run is the problem this replaces.
 */
const SUITE = 'Storage: production presigned round trip';

/** Matches what the browser sends: `filesync.ts` sendBlob -> `helpers.ts` PUT. */
const CONTENT_TYPE = 'application/octet-stream';

// Defaulted to the compose service's own settings rather than required from the
// environment: they are fixed values in `compose.yml`, not credentials, and
// `.env` is gitignored -- a checkout that predates the sample's new block would
// otherwise fail on `undefined`. Override any of them to point somewhere else.
const endpoint = process.env.TEST_MINIO_ENDPOINT || 'http://localhost:9000';

const minioSettings = {
  endpoint,
  region: process.env.TEST_MINIO_REGION || 'us-east-1',
  accessKeyId: process.env.TEST_MINIO_ACCESS_KEY || 'minioadmin',
  secretAccessKey: process.env.TEST_MINIO_SECRET_KEY || 'minioadmin',
  bucketName: process.env.TEST_MINIO_BUCKET_NAME || 'send-test',
  // MinIO is reached at a bare host:port, so the bucket cannot be a subdomain.
  // Backblaze is addressed virtual-hosted; the offline suite below covers that.
  forcePathStyle: true,
};

const config: StorageAdapterConfig = {
  type: StorageType.S3,
  ...minioSettings,
};

/** The same bytes, compared so a failure says which way they differ. */
function expectSameBytes(actual: Buffer, expected: Buffer) {
  expect(actual.byteLength).toBe(expected.byteLength);
  expect(createHash('sha256').update(actual).digest('hex')).toBe(
    createHash('sha256').update(expected).digest('hex')
  );
}

describe(SUITE, () => {
  const storage = new FileStore(config);
  // Reaches the bucket around FileStore, for the setup and inspection it does
  // not expose: creating the bucket, turning on versioning, listing versions.
  const bucketDirect: S3Client = createS3Client(minioSettings);
  const bucket = minioSettings.bucketName;
  const createdKeys: string[] = [];

  /** A key shaped like the uuid the backend mints at `POST /uploads/signed`. */
  function uploadKey(): string {
    const key = `tests/${randomUUID()}`;
    createdKeys.push(key);
    return key;
  }

  /**
   * The browser's PUT: presigned url in, bytes out.
   *
   * Asserted here rather than at the call sites, most of which discard the
   * response. `fetch` only rejects on a network error, so a 403 would otherwise
   * surface as a later 404 and read as reassembly corruption.
   */
  async function putSigned(key: string, body: Buffer): Promise<Response> {
    const url = await storage.getUploadBucketUrl(key, CONTENT_TYPE);
    const response = await fetch(url, {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'Content-Type': CONTENT_TYPE },
    });
    if (!response.ok) {
      throw new Error(
        `PUT ${key} -> ${response.status} ${await response.text()}`
      );
    }
    return response;
  }

  /** The browser's GET. */
  async function getSigned(key: string): Promise<Response> {
    const url = await storage.getDownloadBucketUrl(key);
    return await fetch(url);
  }

  beforeAll(async () => {
    // Probed first so the failure names the fix. Without it the suite dies
    // somewhere inside the AWS SDK's retry loop, thirty seconds later.
    if (!(await isMinioReachable(endpoint))) {
      throw new Error(
        `${SUITE} needs a bucket service, and none answered at ${endpoint}. ` +
          'Start one with `docker compose up -d minio`.'
      );
    }

    try {
      await bucketDirect.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (
        name !== 'BucketAlreadyOwnedByYou' &&
        name !== 'BucketAlreadyExists'
      ) {
        throw error;
      }
    }
    // Production's B2 bucket is versioned, which is why a plain delete there
    // only hides an object. Match that, so a delete test here means something.
    await bucketDirect.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: 'Enabled' },
      })
    );
  }, NETWORK_TEST_TIMEOUT_MS);

  afterAll(async () => {
    for (const key of createdKeys) {
      try {
        const { Versions = [], DeleteMarkers = [] } = await bucketDirect.send(
          new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key })
        );
        for (const { Key, VersionId } of [...Versions, ...DeleteMarkers]) {
          if (Key !== key) continue;
          await bucketDirect.send(
            new DeleteObjectCommand({ Bucket: bucket, Key, VersionId })
          );
        }
      } catch (error) {
        console.warn(`Could not clean up ${key}:`, error);
      }
    }
  }, NETWORK_TEST_TIMEOUT_MS);

  it(
    'writes the bytes the browser PUTs to the signed upload url',
    async () => {
      const key = uploadKey();
      const body = randomBytes(4096);

      const response = await putSigned(key, body);

      expect(response.status).toBe(200);
    },
    NETWORK_TEST_TIMEOUT_MS
  );

  it(
    'leaves the content type to the browser, whatever the backend was told',
    async () => {
      const key = uploadKey();
      const url = await storage.getUploadBucketUrl(key, CONTENT_TYPE);

      // `POST /uploads/signed` reads an unvalidated `type` off the request body
      // and hands it to PutObjectCommand -- but the presigner signs `host` and
      // nothing else, so that type never reaches the wire as a constraint.
      expect(new URL(url).searchParams.get('X-Amz-SignedHeaders')).toBe('host');

      const response = await fetch(url, {
        method: 'PUT',
        body: new Uint8Array(randomBytes(64)),
        headers: { 'Content-Type': 'text/plain' },
      });
      const stored = await bucketDirect.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key })
      );

      // The PUT decides what is stored. Pinned rather than fixed: signing the
      // content type would start rejecting uploads that succeed today.
      expect(response.status).toBe(200);
      expect(stored.ContentType).toBe('text/plain');
    },
    NETWORK_TEST_TIMEOUT_MS
  );

  it(
    'reports the stored size, which is what gates the database row',
    async () => {
      const key = uploadKey();
      const body = randomBytes(4096);
      await putSigned(key, body);

      // `createUpload` throws UPLOAD_SIZE_ERROR when this reads short, and the
      // client polls `uploads/:id/stat` on it before creating any row.
      expect(await storage.length(key)).toBe(body.byteLength);
    },
    NETWORK_TEST_TIMEOUT_MS
  );

  it(
    'returns those exact bytes from the signed download url',
    async () => {
      const key = uploadKey();
      const body = randomBytes(4096);
      await putSigned(key, body);

      const response = await getSigned(key);
      const downloaded = Buffer.from(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expectSameBytes(downloaded, body);
    },
    NETWORK_TEST_TIMEOUT_MS
  );

  it(
    'round trips a split file as independent objects reassembled by part',
    async () => {
      // A file over SPLIT_SIZE is cut up in the browser and each window is
      // uploaded to its own key; nothing server-side knows they belong
      // together. The download re-orders them by the `part` column
      // (`folder-store.ts` downloadMultipart) and concatenates. Real parts are
      // 100 MB; the shape is what matters, not the size.
      const parts = [1, 2, 3].map((part) => ({
        part,
        key: uploadKey(),
        body: randomBytes(64 * 1024),
      }));

      await Promise.all(parts.map(({ key, body }) => putSigned(key, body)));

      // Shuffled, because the order parts finish uploading in is not the order
      // they have to be reassembled in.
      const downloaded = await Promise.all(
        [...parts].reverse().map(async ({ part, key }) => ({
          part,
          bytes: Buffer.from(await (await getSigned(key)).arrayBuffer()),
        }))
      );
      const reassembled = Buffer.concat(
        downloaded.sort((a, b) => a.part - b.part).map(({ bytes }) => bytes)
      );

      expectSameBytes(
        reassembled,
        Buffer.concat(parts.map(({ body }) => body))
      );
    },
    NETWORK_TEST_TIMEOUT_MS
  );

  it(
    'does not invent a download for a key that was never written',
    async () => {
      const key = `tests/${randomUUID()}`;

      const response = await getSigned(key);

      expect(response.status).toBe(404);
      // `createUpload` gates on `sizeOnDisk < size`. `undefined < size` is
      // false, so an undefined here would wave through a row for bytes that do
      // not exist; `null` compares as 0 and fails the gate correctly. Which one
      // comes back is the whole assertion -- a falsy check cannot tell them
      // apart.
      const size = await storage.length(key);
      expect(size).not.toBeUndefined();
      expect(size < 1).toBe(true);
    },
    NETWORK_TEST_TIMEOUT_MS
  );

  it(
    'stops serving an object once it is deleted',
    async () => {
      const key = uploadKey();
      await putSigned(key, randomBytes(4096));
      expect((await getSigned(key)).status).toBe(200);

      await storage.del(key);

      expect((await getSigned(key)).status).toBe(404);
    },
    NETWORK_TEST_TIMEOUT_MS
  );

  it('signs both urls for one hour', async () => {
    const key = `tests/${randomUUID()}`;

    const upload = new URL(await storage.getUploadBucketUrl(key, CONTENT_TYPE));
    const download = new URL(await storage.getDownloadBucketUrl(key));

    for (const url of [upload, download]) {
      expect(url.href).toContain(bucket);
      expect(url.pathname).toContain(key);
      expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
      expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    }
  });

  it(
    'erases every version, rather than hiding the object',
    async () => {
      const key = uploadKey();
      await putSigned(key, randomBytes(4096));

      await storage.del(key);

      const { Versions = [] } = await bucketDirect.send(
        new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key })
      );
      // A plain DeleteObject on a versioned bucket writes a hide marker and
      // leaves the payload -- still stored, still billed. The S3 adapter
      // already deletes per VersionId, so this pins behaviour rather than
      // driving a fix. Production runs B2, whose native adapter removes only
      // the most recent version; that path has no coverage here.
      expect(Versions.filter(({ Key }) => Key === key)).toHaveLength(0);
    },
    NETWORK_TEST_TIMEOUT_MS
  );

  it(
    'treats deleting an absent object as done, not as a failure',
    async () => {
      // `burnFolder` deletes every upload in a container inside one unguarded
      // `Promise.all` (`models/sharing.ts`). A rejection there leaves orphaned
      // upload rows and a leaked object behind, so idempotence matters.
      await expect(storage.del(`tests/${randomUUID()}`)).resolves.toBe(true);
    },
    NETWORK_TEST_TIMEOUT_MS
  );
});
