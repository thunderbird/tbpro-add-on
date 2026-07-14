import { ApiConnection } from '@send-frontend/lib/api';
import { NamedBlob } from '@send-frontend/types';
import {
  generateFileHash,
  getDaysUntilDate,
  sha256Hex,
  streamZippedParts,
  unzipArrayBuffer,
  zipBlob,
} from '@send-frontend/lib/utils';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('generateFileHash', () => {
  it('should generate the same hash for identical file content', async () => {
    const content = 'Hello, World!';
    const blob1 = new Blob([content], { type: 'text/plain' });
    const blob2 = new Blob([content], { type: 'text/plain' });

    const hash1 = await generateFileHash(blob1);
    const hash2 = await generateFileHash(blob2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // Should be a 64-character hex string
  });

  it('should generate different hashes for different file content', async () => {
    const blob1 = new Blob(['Hello, World!'], { type: 'text/plain' });
    const blob2 = new Blob(['Hello, Universe!'], { type: 'text/plain' });

    const hash1 = await generateFileHash(blob1);
    const hash2 = await generateFileHash(blob2);

    expect(hash1).not.toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash2).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate the same hash for the same file content regardless of Blob type', async () => {
    const content = 'Test content for hashing';
    const blob1 = new Blob([content], { type: 'text/plain' });
    const blob2 = new Blob([content], { type: 'application/octet-stream' });

    const hash1 = await generateFileHash(blob1);
    const hash2 = await generateFileHash(blob2);

    expect(hash1).toBe(hash2);
  });

  it('should generate consistent hash for binary data', async () => {
    const binaryData = new Uint8Array([0, 1, 2, 3, 255, 128, 64]);
    const blob1 = new Blob([binaryData]);
    const blob2 = new Blob([binaryData]);

    const hash1 = await generateFileHash(blob1);
    const hash2 = await generateFileHash(blob2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate the same hash when called multiple times on the same blob', async () => {
    const blob = new Blob(['Consistent content'], { type: 'text/plain' });

    const hash1 = await generateFileHash(blob);
    const hash2 = await generateFileHash(blob);
    const hash3 = await generateFileHash(blob);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('should handle empty files consistently', async () => {
    const emptyBlob1 = new Blob([]);
    const emptyBlob2 = new Blob([]);

    const hash1 = await generateFileHash(emptyBlob1);
    const hash2 = await generateFileHash(emptyBlob2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    // SHA-256 of empty string should be: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hash1).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('should handle large files consistently', async () => {
    // Create a larger file content
    const largeContent = 'A'.repeat(10000);
    const blob1 = new Blob([largeContent]);
    const blob2 = new Blob([largeContent]);

    const hash1 = await generateFileHash(blob1);
    const hash2 = await generateFileHash(blob2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce known hash for known content', async () => {
    // Known test vector: SHA-256 of "abc" should be ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    const blob = new Blob(['abc']);
    const hash = await generateFileHash(blob);

    expect(hash).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('should handle unicode content correctly', async () => {
    const unicodeContent = '🚀 Unicode test 你好 🌟';
    const blob1 = new Blob([unicodeContent], { type: 'text/plain' });
    const blob2 = new Blob([unicodeContent], { type: 'text/plain' });

    const hash1 = await generateFileHash(blob1);
    const hash2 = await generateFileHash(blob2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should be deterministic across different execution contexts', async () => {
    const content = 'Deterministic test content';
    const results = [];

    // Generate hash multiple times in sequence
    for (let i = 0; i < 5; i++) {
      const blob = new Blob([content]);
      const hash = await generateFileHash(blob);
      results.push(hash);
    }

    // All results should be identical
    const firstHash = results[0];
    results.forEach((hash) => {
      expect(hash).toBe(firstHash);
    });
  });
});

describe('zipBlob', () => {
  it('produces an application/zip Blob that round-trips through unzipArrayBuffer', async () => {
    const original = 'hello world — round trip me';
    const blob = new Blob([new TextEncoder().encode(original)]);

    const zipped = await zipBlob(blob, 'hello.txt');
    expect(zipped).toBeInstanceOf(Blob);
    expect(zipped.type).toBe('application/zip');

    const out = await unzipArrayBuffer(await zipped.arrayBuffer());
    expect(new TextDecoder().decode(out)).toBe(original);
  });

  it('preserves binary content exactly', async () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
    const zipped = await zipBlob(new Blob([bytes]), 'data.bin');

    const out = new Uint8Array(
      await unzipArrayBuffer(await zipped.arrayBuffer())
    );
    expect(out.length).toBe(bytes.length);
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('is byte-identical to JSZip one-shot output (backwards compatible) and spans multiple chunks', async () => {
    // Big enough that the STORE archive is emitted across several stream chunks,
    // exercising the multi-member Blob assembly (the reason for the rewrite).
    const bytes = new Uint8Array(512 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256;

    const streamedZip = await zipBlob(new Blob([bytes]), 'big.bin');
    const streamed = new Uint8Array(await streamedZip.arrayBuffer());

    // The pre-change implementation: one-shot generateAsync.
    const jszip = new JSZip();
    jszip.file('big.bin', new Blob([bytes]));
    const oneShot = await jszip.generateAsync({ type: 'uint8array' });

    expect(Array.from(streamed)).toEqual(Array.from(oneShot));
  });

  // The >2 GB case (the #981 crash: JSZip's one-shot blob output builds a single
  // >2 GB Blob member and Firefox rejects it) is validated end-to-end by the e2e
  // drag-drop test with a typeless 3 GB file — a 2 GB fixture is impractical in a
  // unit test. This suite locks in that the streamed assembly stays byte-correct.
});

describe('streamZippedParts', () => {
  // A fake API whose suspicious-file check always passes and records the hashes
  // it was asked about.
  const makeApi = (checked: string[]) =>
    ({
      call: vi.fn(async (path: string) => {
        checked.push(path.replace('uploads/check-upload-hash/', ''));
        return { isSuspicious: false };
      }),
    }) as unknown as ApiConnection;

  const makeBlob = (size: number): NamedBlob => {
    // Deterministic, non-uniform bytes so per-window hashes differ.
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 251;
    const blob = new Blob([bytes], { type: 'text/plain' }) as NamedBlob;
    blob.name = 'source.bin';
    return blob;
  };

  const collect = async (
    blob: NamedBlob,
    maxSize: number,
    api: ApiConnection
  ) => {
    const hashProgress: number[] = [];
    const parts: { blob: NamedBlob; hash: string }[] = [];
    for await (const part of streamZippedParts(api, blob, maxSize, (n) =>
      hashProgress.push(n)
    )) {
      parts.push(part);
    }
    return { parts, hashProgress };
  };

  it('splits a file into ceil(size / maxSize) windows across stream reads', async () => {
    const api = makeApi([]);
    const { parts } = await collect(makeBlob(250), 100, api);
    // 250 bytes / 100 => 3 windows (100, 100, 50)
    expect(parts).toHaveLength(3);
  });

  it('hashes the RAW bytes of each window (matching the per-chunk upload hash)', async () => {
    const api = makeApi([]);
    const source = makeBlob(250);
    const { parts } = await collect(source, 100, api);

    const buf = new Uint8Array(await source.arrayBuffer());
    const boundaries = [
      [0, 100],
      [100, 200],
      [200, 250],
    ];
    for (let i = 0; i < boundaries.length; i++) {
      const [start, end] = boundaries[i];
      const expected = await sha256Hex(buf.slice(start, end).buffer);
      expect(parts[i].hash).toBe(expected);
    }
  });

  it('yields zipped parts that unzip back to the exact raw window bytes', async () => {
    const api = makeApi([]);
    const source = makeBlob(250);
    const { parts } = await collect(source, 100, api);

    const buf = new Uint8Array(await source.arrayBuffer());
    const boundaries = [
      [0, 100],
      [100, 200],
      [200, 250],
    ];
    for (let i = 0; i < parts.length; i++) {
      const [start, end] = boundaries[i];
      const out = new Uint8Array(
        await unzipArrayBuffer(await parts[i].blob.arrayBuffer())
      );
      expect(Array.from(out)).toEqual(Array.from(buf.slice(start, end)));
    }
  });

  it('runs the suspicious-file check once per window and reports cumulative progress', async () => {
    const checked: string[] = [];
    const api = makeApi(checked);
    const { parts, hashProgress } = await collect(makeBlob(250), 100, api);

    expect(checked).toEqual(parts.map((p) => p.hash));
    expect(hashProgress).toEqual([100, 200, 250]);
  });

  it('yields a single part for a file that fits in one window', async () => {
    const api = makeApi([]);
    const { parts } = await collect(makeBlob(40), 100, api);
    expect(parts).toHaveLength(1);
  });

  it('aborts as soon as a window is flagged suspicious', async () => {
    vi.stubGlobal('alert', vi.fn());
    let seen = 0;
    const api = {
      call: vi.fn(async () => {
        seen++;
        return { isSuspicious: seen === 2 };
      }),
    } as unknown as ApiConnection;

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of streamZippedParts(
        api,
        makeBlob(250),
        100,
        () => {}
      )) {
        // drain
      }
    }).rejects.toThrow('Suspicious file detected');
    // Stopped at the second window; never checked the third.
    expect(seen).toBe(2);
    vi.unstubAllGlobals();
  });
});

describe('getDaysUntilDate', () => {
  beforeEach(() => {
    // Set fixed date to January 15, 2024
    vi.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return positive days for future date', () => {
    const futureDate = new Date('2024-01-20'); // 5 days in future
    expect(getDaysUntilDate(futureDate)).toBe(5);
  });

  it('should return zero for current date', () => {
    const currentDate = new Date('2024-01-15');
    expect(getDaysUntilDate(currentDate)).toBe(0);
  });

  it('should not return negative days for past date', () => {
    const pastDate = new Date('2024-01-10'); // 5 days ago
    expect(getDaysUntilDate(pastDate)).toBe(0);
  });

  it('should handle date at end of month correctly', () => {
    const endOfMonth = new Date('2024-01-31');
    expect(getDaysUntilDate(endOfMonth)).toBe(16);
  });

  it('should handle string dates correctly', () => {
    expect(getDaysUntilDate('2024-01-20')).toBe(5);
  });

  it('should handle ISO format dates correctly', () => {
    expect(getDaysUntilDate('2024-01-20T15:30:00.000Z')).toBe(6);
  });

  it('should handle timezone differences correctly', () => {
    const dateWithTimezone = '2024-01-16T00:00:00+02:00'; // One day ahead but with timezone
    expect(getDaysUntilDate(dateWithTimezone)).toBe(1);
  });

  it('should not return fractional days', () => {
    const laterInDay = '2024-01-15T23:59:59.999Z';
    expect(getDaysUntilDate(laterInDay)).toBe(1);
  });

  it('should handle invalid date strings', () => {
    expect(() => getDaysUntilDate('invalid-date')).not.toThrow();
  });

  it('should handle invalid date strings', () => {
    expect(getDaysUntilDate('invalid-date')).toBe(0);
  });
});
