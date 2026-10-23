import {
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { StorageType } from '@tweedegolf/storage-abstraction';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileStore } from '../../storage';

// `del` and `listObjects` address the bucket by key over the S3 API. The
// adapters' removeFile only scanned the first listing page, so a key past it
// was reported deleted and kept. S3Client.send is stubbed: no bucket needed.

const B2 = {
  type: StorageType.B2,
  bucketName: 'bucket',
  applicationKeyId: 'id',
  applicationKey: 'secret',
  endpoint: 'https://s3.us-west-004.backblazeb2.com',
  region: 'us-west-004',
};

function stubSend(reply: (command: unknown) => unknown) {
  return vi
    .spyOn(S3Client.prototype, 'send')
    .mockImplementation(async (command: unknown) => reply(command));
}

afterEach(() => vi.restoreAllMocks());

describe('FileStore.del', () => {
  it('deletes every version and delete marker of exactly that key', async () => {
    const send = stubSend((command) => {
      if (command instanceof ListObjectVersionsCommand) {
        return {
          Versions: [
            { Key: 'k', VersionId: 'v1' },
            { Key: 'k-other', VersionId: 'x' },
          ],
          DeleteMarkers: [{ Key: 'k', VersionId: 'm1' }],
          IsTruncated: false,
        };
      }
      return {};
    });

    expect(await new FileStore(B2).del('k')).toBe(true);

    const deleted = send.mock.calls
      .map(([c]) => c)
      .filter((c) => c instanceof DeleteObjectCommand)
      .map((c) => (c as DeleteObjectCommand).input);
    expect(deleted).toEqual([
      { Bucket: 'bucket', Key: 'k', VersionId: 'v1' },
      { Bucket: 'bucket', Key: 'k', VersionId: 'm1' },
    ]);
  });

  it('follows the version listing across pages', async () => {
    const pages = [
      {
        Versions: [{ Key: 'k', VersionId: 'v1' }],
        IsTruncated: true,
        NextKeyMarker: 'k',
        NextVersionIdMarker: 'v1',
      },
      { Versions: [{ Key: 'k', VersionId: 'v2' }], IsTruncated: false },
    ];
    const send = stubSend((command) =>
      command instanceof ListObjectVersionsCommand ? pages.shift() : {}
    );

    await new FileStore(B2).del('k');

    const lists = send.mock.calls
      .map(([c]) => c)
      .filter((c) => c instanceof ListObjectVersionsCommand)
      .map((c) => (c as ListObjectVersionsCommand).input);
    expect(lists[1]).toMatchObject({ KeyMarker: 'k', VersionIdMarker: 'v1' });
    expect(
      send.mock.calls.filter(([c]) => c instanceof DeleteObjectCommand)
    ).toHaveLength(2);
  });

  it('treats an absent key as deleted', async () => {
    stubSend(() => ({ Versions: [], IsTruncated: false }));

    expect(await new FileStore(B2).del('missing')).toBe(true);
  });

  it('rejects when the bucket refuses the delete', async () => {
    stubSend((command) => {
      if (command instanceof DeleteObjectCommand) throw new Error('denied');
      return { Versions: [{ Key: 'k', VersionId: 'v1' }] };
    });

    await expect(new FileStore(B2).del('k')).rejects.toThrow('denied');
  });
});

describe('FileStore.listObjects', () => {
  it('lists keys from the version listing, including hidden ones', async () => {
    const older = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-02-01T00:00:00Z');
    const send = stubSend(() => ({
      Versions: [
        { Key: 'a', LastModified: older },
        { Key: 'b', LastModified: older },
      ],
      DeleteMarkers: [{ Key: 'b', LastModified: newer }],
      IsTruncated: true,
      NextKeyMarker: 'b',
    }));

    const page = await new FileStore(B2).listObjects('cursor', 1000);

    expect(page).toEqual({
      objects: [
        { key: 'a', lastModified: older },
        { key: 'b', lastModified: newer },
      ],
      next: 'b',
    });
    const [command] = send.mock.calls[0];
    expect(command).toBeInstanceOf(ListObjectVersionsCommand);
    expect((command as ListObjectVersionsCommand).input).toEqual({
      Bucket: 'bucket',
      KeyMarker: 'cursor',
      MaxKeys: 1000,
    });
  });

  it('has no next cursor on the last page', async () => {
    stubSend(() => ({ Versions: [], IsTruncated: false }));

    expect(await new FileStore(B2).listObjects()).toEqual({ objects: [] });
  });
});
