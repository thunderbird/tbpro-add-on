import { describe, it, expect } from 'vitest';
import { findBodyPart } from '@/lib/Messages';
import { mockMessageParts, mockMessageBody } from '@/lib/Messages.mock';

describe('findBodyPart', () => {
  it('returns plaintext when available', () => {
    const parts = [
      { contentType: 'text/plain', body: 'plain text' },
      { contentType: 'text/html', body: '<p>HTML</p>' },
    ];
    expect(findBodyPart(parts)).toBe('plain text');
  });

  it('uses HTML when no plaintext', () => {
    const parts = [{ contentType: 'text/html', body: '<p>Hello</p>' }];
    expect(findBodyPart(parts)).toBe('Hello');
  });

  it('uses HTML when HTML 100x longer than plaintext', () => {
    const small = 'short';
    const longHtml = `<p>${'a'.repeat(600)}</p>`;
    const parts = [
      { contentType: 'text/plain', body: small },
      { contentType: 'text/html', body: longHtml },
    ];
    const result = findBodyPart(parts) as string;
    expect(result.startsWith('a')).toBe(true);
    expect(result.length).toBe(600);
  });

  it('recurses into nested parts when no body at top level', () => {
    const nested = { contentType: 'text/plain', body: 'nested text' };
    const parts = [{ parts: [nested] } as any];
    expect(findBodyPart(parts)).toBe('nested text');
  });

  it('recurses into deeply nested parts', () => {
    const parts = [{ parts: mockMessageParts } as any];
    expect(findBodyPart(parts)).toBe(mockMessageBody);
  });

  it('returns empty string when no body found', () => {
    expect(findBodyPart([])).toBe('');
  });
});
