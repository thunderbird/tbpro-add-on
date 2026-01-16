import { parsePassphrase } from '@send-frontend/lib/passphraseUtils';
import { describe, expect, it } from 'vitest';

describe('parsePassphrase', () => {
  it('should parse a passphrase with single spaces between words', () => {
    const input = 'word1 word2 word3 word4 word5 word6';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should parse a passphrase with multiple spaces between words', () => {
    const input = 'word1  word2   word3    word4 word5      word6';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should parse a passphrase with hyphens between words', () => {
    const input = 'word1-word2-word3-word4-word5-word6';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should parse a passphrase with mixed spaces and hyphens', () => {
    const input = 'word1 - word2-word3  word4   -word5 word6';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should trim leading spaces', () => {
    const input = '   word1 word2 word3 word4 word5 word6';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should trim trailing spaces', () => {
    const input = 'word1 word2 word3 word4 word5 word6   ';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should trim leading and trailing spaces', () => {
    const input = '   word1 word2 word3 word4 word5 word6   ';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should handle complex spacing with leading, trailing, and multiple spaces', () => {
    const input = '  word1  word2   word3 word4 word5 word6  ';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should handle multiple consecutive hyphens', () => {
    const input = 'word1--word2---word3-word4-word5-word6';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should handle mixed spaces and multiple hyphens', () => {
    const input = 'word1  -  word2 -- word3   word4-word5 word6';
    const expected = 'word1-word2-word3-word4-word5-word6';
    expect(parsePassphrase(input)).toBe(expected);
  });

  it('should throw an error if fewer than 6 words are provided', () => {
    const input = 'word1 word2 word3 word4 word5';
    expect(() => parsePassphrase(input)).toThrow('Expected 6 words, got 5');
  });

  it('should throw an error if more than 6 words are provided', () => {
    const input = 'word1 word2 word3 word4 word5 word6 word7';
    expect(() => parsePassphrase(input)).toThrow('Expected 6 words, got 7');
  });

  it('should throw an error if empty string is provided', () => {
    const input = '';
    expect(() => parsePassphrase(input)).toThrow('Expected 6 words, got 0');
  });

  it('should throw an error if only spaces are provided', () => {
    const input = '     ';
    expect(() => parsePassphrase(input)).toThrow('Expected 6 words, got 0');
  });

  it('should throw an error if only hyphens are provided', () => {
    const input = '-----';
    expect(() => parsePassphrase(input)).toThrow('Expected 6 words, got 0');
  });

  it('should throw an error if mixed spaces and hyphens without words are provided', () => {
    const input = '  -  -  - ';
    expect(() => parsePassphrase(input)).toThrow('Expected 6 words, got 0');
  });
});
