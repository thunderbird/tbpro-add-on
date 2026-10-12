import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomHex, randomUnitInterval } from './secureRandom';

describe('secureRandom', () => {
  afterEach(() => vi.restoreAllMocks());

  it('randomHex returns two hex chars per requested byte', () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(randomHex(1)).toMatch(/^[0-9a-f]{2}$/);
  });

  it('randomHex draws from crypto.getRandomValues, not Math.random', () => {
    const mathRandom = vi.spyOn(Math, 'random');
    const getRandomValues = vi.spyOn(crypto, 'getRandomValues');
    randomHex(8);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('randomHex zero-pads small byte values', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).fill(0);
      (array as Uint8Array)[1] = 0x0a;
      return array;
    });
    expect(randomHex(2)).toBe('000a');
  });

  it('randomUnitInterval stays within [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const value = randomUnitInterval();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('randomUnitInterval maps the 32-bit range onto [0, 1)', () => {
    const feed = (raw: number) =>
      vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
        (array as Uint32Array)[0] = raw;
        return array;
      });
    feed(0);
    expect(randomUnitInterval()).toBe(0);
    feed(0xffffffff);
    expect(randomUnitInterval()).toBeLessThan(1);
    feed(2 ** 31);
    expect(randomUnitInterval()).toBe(0.5);
  });
});
