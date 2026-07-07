/**
 * Verifies the HTTP-level retry behavior added in #679 — specifically that
 * transient 5xx errors (as observed against B2 in storage benchmarks) recover
 * on retry rather than surfacing to the user as upload failures.
 *
 * See: thunderbird/tbpro-add-on#814, thunderbird/platform-infrastructure#274
 */
import { mockProgressTracker } from '@send-frontend/test/lib/helpers';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  getUploadRetryDelayMs,
  UPLOAD_ABORTED,
  UPLOAD_HTTP_RETRY_LIMIT,
  uploadWithTracker,
} from './helpers';

const TEST_URL = 'http://test.local/api/upload';

// Real setTimeout, captured before any spy replaces the global. Retry tests
// mock setTimeout to run on the next tick (no wall-clock wait) so exponential
// backoff doesn't make the suite take seconds, while still recording the
// delays that were requested.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

function makeStream(content = 'test-payload') {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    },
  });
}

describe('uploadWithTracker — HTTP-level retry', () => {
  const server = setupServer();
  let scheduledDelays: number[];

  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  beforeEach(() => {
    // Re-reset the mock per test so call counts are clean
    mockProgressTracker.setProgress = vi.fn();

    // Record each requested backoff delay and fire the callback on the next
    // tick so retries don't incur real exponential-backoff waits.
    scheduledDelays = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      cb: () => void,
      ms?: number
    ) => {
      scheduledDelays.push(ms ?? 0);
      return realSetTimeout(cb, 0);
    }) as typeof setTimeout);
  });

  it('recovers from a transient 500 on the first attempt', async () => {
    let calls = 0;
    server.use(
      http.put(TEST_URL, () => {
        calls++;
        if (calls === 1) {
          return HttpResponse.text('B2 transient error', { status: 500 });
        }
        return HttpResponse.text('ok', { status: 200 });
      })
    );

    await expect(
      uploadWithTracker({
        url: TEST_URL,
        readableStream: makeStream(),
        progressTracker: mockProgressTracker,
      })
    ).resolves.toBeDefined();

    expect(calls).toBe(2);
  });

  it('recovers from two consecutive 500s (succeeds on third attempt)', async () => {
    let calls = 0;
    server.use(
      http.put(TEST_URL, () => {
        calls++;
        if (calls < 3) {
          return HttpResponse.text('B2 transient error', { status: 500 });
        }
        return HttpResponse.text('ok', { status: 200 });
      })
    );

    await expect(
      uploadWithTracker({
        url: TEST_URL,
        readableStream: makeStream(),
        progressTracker: mockProgressTracker,
      })
    ).resolves.toBeDefined();

    expect(calls).toBe(3);
  });

  it('throws UPLOAD_FAILED after exhausting all attempts (default 4)', async () => {
    let calls = 0;
    server.use(
      http.put(TEST_URL, () => {
        calls++;
        return HttpResponse.text('persistent error', { status: 500 });
      })
    );

    await expect(
      uploadWithTracker({
        url: TEST_URL,
        readableStream: makeStream(),
        progressTracker: mockProgressTracker,
      })
    ).rejects.toThrow(/UPLOAD_FAILED/);

    // limit retries + the initial attempt
    expect(calls).toBe(UPLOAD_HTTP_RETRY_LIMIT + 1);
    // One backoff delay scheduled per retry
    expect(scheduledDelays).toHaveLength(UPLOAD_HTTP_RETRY_LIMIT);
  });

  it('schedules retries with strictly increasing (exponential) backoff', async () => {
    server.use(
      http.put(TEST_URL, () =>
        HttpResponse.text('persistent error', { status: 500 })
      )
    );

    await expect(
      uploadWithTracker({
        url: TEST_URL,
        readableStream: makeStream(),
        progressTracker: mockProgressTracker,
      })
    ).rejects.toThrow(/UPLOAD_FAILED/);

    // Jitter ranges per attempt don't overlap (each is [base*2^a*0.5,
    // base*2^a)), so successive delays are always strictly increasing.
    for (let i = 1; i < scheduledDelays.length; i++) {
      expect(scheduledDelays[i]).toBeGreaterThan(scheduledDelays[i - 1]);
    }
  });

  it('retries on a network error (msw: HttpResponse.error)', async () => {
    let calls = 0;
    server.use(
      http.put(TEST_URL, () => {
        calls++;
        if (calls === 1) return HttpResponse.error();
        return HttpResponse.text('ok', { status: 200 });
      })
    );

    await expect(
      uploadWithTracker({
        url: TEST_URL,
        readableStream: makeStream(),
        progressTracker: mockProgressTracker,
      })
    ).resolves.toBeDefined();

    expect(calls).toBe(2);
  });

  it("retries on 4xx (verifies retry isn't gated on 5xx-only)", async () => {
    // Documents current behavior: any non-2xx triggers retry. This may not be
    // semantically correct (a 4xx is the client's fault and won't get better
    // on retry), but it's what the code does today.
    let calls = 0;
    server.use(
      http.put(TEST_URL, () => {
        calls++;
        if (calls === 1)
          return HttpResponse.text('bad request', { status: 400 });
        return HttpResponse.text('ok', { status: 200 });
      })
    );

    await expect(
      uploadWithTracker({
        url: TEST_URL,
        readableStream: makeStream(),
        progressTracker: mockProgressTracker,
      })
    ).resolves.toBeDefined();

    expect(calls).toBe(2);
  });

  it('does not attempt the PUT when the signal is already aborted', async () => {
    let calls = 0;
    server.use(
      http.put(TEST_URL, () => {
        calls++;
        return HttpResponse.text('ok', { status: 200 });
      })
    );

    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadWithTracker({
        url: TEST_URL,
        readableStream: makeStream(),
        progressTracker: mockProgressTracker,
        signal: controller.signal,
      })
    ).rejects.toThrow(UPLOAD_ABORTED);

    // Aborted before it started: no request, and no backoff scheduled.
    expect(calls).toBe(0);
    expect(scheduledDelays).toHaveLength(0);
  });

  it('resets progress to 0 before each retry attempt', async () => {
    let calls = 0;
    server.use(
      http.put(TEST_URL, () => {
        calls++;
        if (calls < 3) return HttpResponse.text('err', { status: 500 });
        return HttpResponse.text('ok', { status: 200 });
      })
    );

    await uploadWithTracker({
      url: TEST_URL,
      readableStream: makeStream(),
      progressTracker: mockProgressTracker,
    });

    // First attempt: no setProgress(0) (attempt === 0).
    // Second attempt (retry #1): setProgress(0).
    // Third attempt (retry #2): setProgress(0).
    const zeroResetCalls = (
      mockProgressTracker.setProgress as ReturnType<typeof vi.fn>
    ).mock.calls.filter((args) => args[0] === 0).length;
    expect(zeroResetCalls).toBeGreaterThanOrEqual(2);
  });
});

describe('getUploadRetryDelayMs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('grows exponentially with the attempt index (jitter floor)', () => {
    // Math.random() === 0 => jitter factor 0.5
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(getUploadRetryDelayMs(0, 1000)).toBe(500);
    expect(getUploadRetryDelayMs(1, 1000)).toBe(1000);
    expect(getUploadRetryDelayMs(2, 1000)).toBe(2000);
  });

  it('keeps each delay within [base*2^attempt*0.5, base*2^attempt)', () => {
    const base = 1000;
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      for (let attempt = 0; attempt < 4; attempt++) {
        const exp = base * 2 ** attempt;
        const delay = getUploadRetryDelayMs(attempt, base);
        expect(delay).toBeGreaterThanOrEqual(exp * 0.5);
        expect(delay).toBeLessThan(exp);
      }
      vi.restoreAllMocks();
    }
  });
});
