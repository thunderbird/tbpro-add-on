import { describe, expect, it } from 'vitest';
import { mapLimit } from './mapLimit';

describe('mapLimit', () => {
  it('keeps input order and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });

    expect(result).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });

  it('returns an empty array for no items', async () => {
    expect(await mapLimit([], 3, async (n: number) => n)).toEqual([]);
  });

  it('rejects when a call rejects', async () => {
    await expect(
      mapLimit([1, 2], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      })
    ).rejects.toThrow('boom');
  });
});
