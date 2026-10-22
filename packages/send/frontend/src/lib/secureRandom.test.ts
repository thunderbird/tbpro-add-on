import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomHex } from './secureRandom';

describe('randomHex', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns two hex chars per requested byte', () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(randomHex(1)).toMatch(/^[0-9a-f]{2}$/);
  });

  it('draws from crypto.getRandomValues, not Math.random', () => {
    const mathRandom = vi.spyOn(Math, 'random');
    const getRandomValues = vi.spyOn(crypto, 'getRandomValues');
    randomHex(8);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('zero-pads small byte values', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).fill(0);
      (array as Uint8Array)[1] = 0x0a;
      return array;
    });
    expect(randomHex(2)).toBe('000a');
  });

  it('produces distinct values on successive calls', () => {
    expect(randomHex(16)).not.toBe(randomHex(16));
  });
});
