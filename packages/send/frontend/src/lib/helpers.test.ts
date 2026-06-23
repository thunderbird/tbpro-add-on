import { mockProgressTracker } from '@send-frontend/test/lib/helpers';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { describe, expect, it, vi } from 'vitest';
import { uploadWithTracker } from './helpers';

const TEST_URL = `${import.meta.env.VITE_SEND_SERVER_URL}/api`;
const TEST_CONTENT = 'test-content';
const TEST_BLOB = new Blob([TEST_CONTENT]);

// Real setTimeout captured before any spy; retry tests fire the callback on
// the next tick so the upload's exponential backoff adds no wall-clock wait.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

describe('helpers', () => {
  const restHandlers = [
    http.get(`${TEST_URL}/download/*`, () =>
      HttpResponse.json({ blob: TEST_BLOB })
    ),
    http.put(`${TEST_URL}/upload`, async () =>
      HttpResponse.json({ status: 'success' }, { status: 201 })
    ),
  ];

  let server = setupServer(...restHandlers);

  beforeAll(() => {
    server.listen();
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      cb: () => void
    ) => realSetTimeout(cb, 0)) as typeof setTimeout);
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  describe('uploadWithTracker', () => {
    const restHandlers = [
      http.get(`${TEST_URL}/download/*`, () =>
        HttpResponse.json({ blob: TEST_BLOB })
      ),
      http.put(`${TEST_URL}/upload`, async () =>
        HttpResponse.json({}, { status: 400 })
      ),
    ];

    describe('helpers', () => {
      describe('uploadWithTracker', () => {
        it('should track upload progress', async () => {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(TEST_CONTENT));
              controller.close();
            },
          });

          try {
            const result = await uploadWithTracker({
              url: `${TEST_URL}/upload`,
              readableStream: stream,
              progressTracker: mockProgressTracker,
            });
            expect(mockProgressTracker.setProgress).toHaveBeenCalled();
            expect(result).toBe('{"status":"success"}');
          } catch (error) {
            console.log(error);
          }
        });

        server.close();
        server.resetHandlers();
        server = setupServer(...restHandlers);

        it('should handle errors', async () => {
          const progressTracker = vi.fn();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(TEST_CONTENT));
              controller.close();
            },
          });

          try {
            await uploadWithTracker({
              url: `${TEST_URL}/upload`,
              readableStream: stream,
              progressTracker: mockProgressTracker,
            });
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(progressTracker).not.toHaveBeenCalled();
          }
        });
      });
    });
  });
});
