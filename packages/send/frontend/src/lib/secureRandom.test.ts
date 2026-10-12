import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomHex, randomIntBelow } from './secureRandom';

/**
 * Feed crypto.getRandomValues a fixed sequence of 32-bit words (cycled), so the
 * rejection-sampling path can be driven deterministically.
 */
function feedRandomWords(words: number[]) {
  let i = 0;
  return vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    (array as Uint32Array)[0] = words[i % words.length] >>> 0;
    i += 1;
    return array;
  });
}

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

describe('randomIntBelow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns 0 for max <= 1 without drawing', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    expect(randomIntBelow(0)).toBe(0);
    expect(randomIntBelow(1)).toBe(0);
    expect(randomIntBelow(-5)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('masks the draw to the covering power of two and keeps in-range values', () => {
    // max = 500 => mask = 511. 0xABCD01F8 & 511 = 504 >= 500 is rejected;
    // the next word 0x000001F3 & 511 = 499 is accepted.
    const spy = feedRandomWords([0xabcd01f8, 0x000001f3]);
    expect(randomIntBelow(500)).toBe(499);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('rejects every out-of-range candidate until one fits (unbiased)', () => {
    // All words mask to 511, 510, ... down to 500 (rejected), then 0.
    const words = [
      511, 510, 509, 508, 507, 506, 505, 504, 503, 502, 501, 500, 0,
    ];
    const spy = feedRandomWords(words);
    expect(randomIntBelow(500)).toBe(0);
    expect(spy).toHaveBeenCalledTimes(words.length);
  });

  it('never uses Math.random and stays in [0, max) over many real draws', () => {
    const mathRandom = vi.spyOn(Math, 'random');
    for (const max of [2, 3, 7, 500, 1000, 12345]) {
      for (let i = 0; i < 500; i++) {
        const value = randomIntBelow(max);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(max);
      }
    }
    expect(mathRandom).not.toHaveBeenCalled();
  });
});
