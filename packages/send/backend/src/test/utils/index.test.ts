import { Upload } from '@prisma/client';
import {
  DAYS_TO_EXPIRY,
  JWT_EXPIRY_IN_MILLISECONDS,
} from '@send-backend/config';
import {
  addExpiryToContainer,
  convertDaysToMilliseconds,
  convertMillisecondsToMinutes,
  formatDaysToExpiry,
  getCookie,
} from '@send-backend/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getCookie', () => {
  it('should return the correct cookie value when present', () => {
    const cookieStr =
      'name=JohnDoe; Authorization=Bearer%20token123; otherCookie=value';
    const result = getCookie(cookieStr, 'Authorization');
    expect(result).toBe('Bearer token123');
  });

  it('should return null if the cookie is not found', () => {
    const cookieStr = 'name=JohnDoe; otherCookie=value';
    const result = getCookie(cookieStr, 'Authorization');
    expect(result).toBeNull();
  });

  it('should return null for an empty cookie string', () => {
    const result = getCookie('', 'Authorization');
    expect(result).toBeNull();
  });

  it('should return null for an empty cookie name', () => {
    const cookieStr = 'name=JohnDoe; Authorization=Bearer%20token123';
    const result = getCookie(cookieStr, '');
    expect(result).toBeNull();
  });

  it('should correctly decode URL-encoded values', () => {
    const cookieStr = 'Authorization=Bearer%20token123';
    const result = getCookie(cookieStr, 'Authorization');
    expect(result).toBe('Bearer token123');
  });
});

describe('convertMillisecondsToMinutes', () => {
  it('should convert milliseconds to minutes and stringify', () => {
    // 1 minute in ms = 60_000
    const ms = 60_000;
    const result = convertMillisecondsToMinutes(ms);
    expect(result).toEqual({ minutes: 1, stringified: '1m' });
  });

  it('should convert milliseconds to minutes and stringify', () => {
    const ms = JWT_EXPIRY_IN_MILLISECONDS;
    const result = convertMillisecondsToMinutes(ms);
    expect(result).toEqual({ minutes: 60, stringified: '60m' });
  });

  it('should handle zero milliseconds', () => {
    const result = convertMillisecondsToMinutes(0);
    expect(result).toEqual({ minutes: 0, stringified: '0m' });
  });

  it('should throw for negative milliseconds', () => {
    expect(() => convertMillisecondsToMinutes(-1)).toThrow(
      'The input should be a positive number'
    );
  });
});

describe('convertDaysToMilliseconds', () => {
  it('should return correct expiration details for valid days', () => {
    const days = 1;
    const result = convertDaysToMilliseconds(days);
    expect(result).toEqual({
      milliseconds: 86_400_000, // 5 days in milliseconds
      stringified: '1d',
    });
  });

  it('should throw an error if days is not a round number', () => {
    const days = 5.5;
    const testFunc = () => convertDaysToMilliseconds(days);
    expect(testFunc).toThrow(
      'The input should be a round number specifying days'
    );
  });
});

describe('addExpiryToContainer', () => {
  beforeEach(() => {
    // Set fixed date to January 15, 2024
    vi.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should calculate correct days to expiry for a new upload', () => {
    const mockUpload: Upload = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      createdAt: new Date('2024-01-01'), // 14 days ago
      ownerId: 'user-123',
      reported: false,
      reportedAt: null,
      size: 100n,
      type: 'image/jpeg',
      part: null,
    };

    const result = addExpiryToContainer(mockUpload);
    expect(result.daysToExpiry).toBe(1); // 1 day left
    expect(result.expired).toBeFalsy();
  });

  it('should mark as expired when exactly at expiry date', () => {
    const mockUpload: Upload = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      createdAt: new Date('2023-12-31'), // 15 days ago
      ownerId: 'user-123',
      reported: false,
      reportedAt: null,
      size: 100n,
      type: 'image/jpeg',
      part: null,
    };

    const result = addExpiryToContainer(mockUpload);
    expect(result.daysToExpiry).toBe(0);
    expect(result.expired).toBeTruthy();
  });

  it('should mark as expired when past expiry date', () => {
    const mockUpload: Upload = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      createdAt: new Date('2023-12-30'), // 16 days ago
      ownerId: 'user-123',
      reported: false,
      reportedAt: null,
      size: 100n,
      type: 'image/jpeg',
      part: null,
    };

    const result = addExpiryToContainer(mockUpload);
    expect(result.daysToExpiry).toBe(0);
    expect(result.expired).toBeTruthy();
  });
});

describe('formatDaysToExpiry', () => {
  it('should return 0 for negative days', () => {
    expect(formatDaysToExpiry(-1)).toBe(0);
  });

  it('should return same number for positive days', () => {
    expect(formatDaysToExpiry(1)).toBe(1);
    expect(formatDaysToExpiry(5)).toBe(5);
  });
});

describe('addExpiryToContainer', () => {
  beforeEach(() => {
    // Set fixed date to January 15, 2024
    vi.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should include days to expiry', () => {
    const mockUpload: Upload = {
      id: '123e4567-e89b-12d3-a456-426614174003',
      createdAt: new Date('2024-01-13'), // 2 days ago
      ownerId: 'user-123',
      reported: false,
      reportedAt: null,
      size: 100n,
      type: 'image/jpeg',
      part: null,
    };

    const result = addExpiryToContainer(mockUpload);
    expect(result.daysToExpiry).toBe(DAYS_TO_EXPIRY - 2);
  });
});
