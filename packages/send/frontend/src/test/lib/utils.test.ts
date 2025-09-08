import { generateFileHash, getDaysUntilDate } from '@send-frontend/lib/utils';
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
