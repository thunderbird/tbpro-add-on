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
import { uploadWithTracker } from './helpers';

const TEST_URL = 'http://test.local/api/upload';

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

  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
  });
  afterAll(() => server.close());

  beforeEach(() => {
    // Re-reset the mock per test so call counts are clean
    mockProgressTracker.setProgress = vi.fn();
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

  it('throws UPLOAD_FAILED after exhausting all 3 attempts', async () => {
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

    expect(calls).toBe(3);
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

  it('retries on 4xx (verifies retry isn\'t gated on 5xx-only)', async () => {
    // Documents current behavior: any non-2xx triggers retry. This may not be
    // semantically correct (a 4xx is the client's fault and won't get better
    // on retry), but it's what the code does today.
    let calls = 0;
    server.use(
      http.put(TEST_URL, () => {
        calls++;
        if (calls === 1) return HttpResponse.text('bad request', { status: 400 });
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
    const zeroResetCalls = (mockProgressTracker.setProgress as ReturnType<typeof vi.fn>).mock.calls
      .filter((args) => args[0] === 0).length;
    expect(zeroResetCalls).toBeGreaterThanOrEqual(2);
  });
});
