import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Filesystem storage, for local development and the tests. Objects live at
 * `<directory>/<bucketName>/<key>`.
 *
 * The interface it presents is the one ./index.ts needs, in the shapes the S3
 * plane already returns: a missing object reads as `null`, and deleting one
 * succeeds.
 */
export class LocalStorage {
  constructor(
    private directory?: string,
    private bucketName?: string
  ) {}

  /**
   * Keys reach us from clients, and `path.resolve` happily walks out of the
   * bucket given `../`.
   */
  private pathFor(key: string): string {
    if (!this.directory) {
      throw new Error(
        'Local storage needs a directory (FS_LOCAL_DIR, or `directory` in the config)'
      );
    }
    const root = path.resolve(this.directory, this.bucketName ?? '');
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(
        `Refusing a key that resolves outside the bucket: ${key}`
      );
    }
    return target;
  }

  async set(key: string, stream: Readable): Promise<void> {
    const target = this.pathFor(key);
    // Keys may contain slashes; create the parent directories.
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await pipeline(stream, fs.createWriteStream(target));
  }

  async get(key: string): Promise<Readable | null> {
    const target = this.pathFor(key);
    try {
      // Only "absent" is null. Anything else -- EACCES, EIO -- must reach the
      // caller, matching `isNotFoundError` on the S3 plane.
      const stats = await fs.promises.stat(target);
      if (!stats.isFile()) {
        return null;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
    return fs.createReadStream(target);
  }

  async del(key: string): Promise<void> {
    await fs.promises.rm(this.pathFor(key), { force: true });
  }

  async length(key: string): Promise<number> {
    const stats = await fs.promises.stat(this.pathFor(key));
    return stats.size;
  }
}
