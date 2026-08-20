import { TRPC_WS_PATH } from '@send-backend/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWss } = vi.hoisted(() => ({
  mockWss: {
    handleUpgrade: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    clients: new Set(),
  },
}));

vi.mock('../../index', () => ({ wss: mockWss }));
vi.mock('../../sentry', () => ({}));

import { wsHandler } from '../../ws/setup';

// Named for what it was. Nothing routes here now; these are resurrection pins.
const REMOVED_UPLOAD_PATH = '/api/ws';

/**
 * `/api/ws` handed the socket to an upload handler that streamed into storage on
 * the server's own credentials, and the upgrade was performed with no token
 * check at all (private-issue-tracking#44). #1153 required a session; this
 * removes the path instead, because no client has reached it since bucket
 * storage became the only backend.
 */
describe('wsHandler', () => {
  let upgrade: (req, socket, head) => void;
  const socket = () => ({ on: vi.fn(), end: vi.fn(), destroy: vi.fn() });

  const authedCookie =
    'authorization=Bearer%20token;refresh_token=Bearer%20refresh';

  beforeEach(() => {
    vi.clearAllMocks();
    const server = { on: vi.fn() };
    wsHandler(server);
    upgrade = server.on.mock.calls.find(([event]) => event === 'upgrade')[1];
  });

  // The pin that outlives the gate: a *valid* session is refused too, because
  // there is no upload socket to hand out any more. If someone reinstates the
  // handler, this fails rather than silently restoring a bucket-write path.
  it.each([
    ['no cookie', {}],
    ['a session cookie', { cookie: authedCookie }],
  ])('refuses the upload path with %s', (_label, headers) => {
    const s = socket();

    upgrade({ url: REMOVED_UPLOAD_PATH, headers }, s, Buffer.alloc(0));

    expect(mockWss.handleUpgrade).not.toHaveBeenCalled();
    expect(s.end).toHaveBeenCalledWith(
      expect.stringContaining('404 Not Found'),
      expect.any(Function)
    );
  });

  // Do not "harden" this one to match the upload path. Logging in happens over
  // it: `LoginPage.vue` subscribes to `onLoginFinished` before the user has a
  // session, and that subscription needs the socket. The procedure is
  // deliberately not behind `isAuthed` and returns early if a session already
  // exists (`trpc/users.ts:156`). Requiring a token here would deadlock login --
  // you would need to be logged in to find out that you had logged in.
  // `onVerificationRequested`, `onVerificationFinished` and `onPassphraseShared`
  // are the same shape.
  it.each([
    ['no token, which login depends on', {}],
    // A stale or malformed cookie must not stop someone logging in again.
    [
      'a cookie that does not validate',
      { cookie: 'authorization=Bearer%20junk' },
    ],
  ])(`upgrades ${TRPC_WS_PATH} with %s`, (_label, headers) => {
    const s = socket();

    upgrade({ url: TRPC_WS_PATH, headers }, s, Buffer.alloc(0));

    expect(mockWss.handleUpgrade).toHaveBeenCalled();
    expect(s.end).not.toHaveBeenCalled();
  });

  // `/api/messagebus` rebroadcast every frame to every client on the process,
  // unauthenticated, and nothing ever instantiated its one client
  // (private-issue-tracking#40). It is gone, so it 404s like any other path.
  it.each(['/api/messagebus', '/api/messagebus/anything', '/nope'])(
    'answers 404 and closes the socket for %s',
    (url) => {
      const s = socket();

      upgrade({ url, headers: {} }, s, Buffer.alloc(0));

      expect(s.end).toHaveBeenCalledWith(
        expect.stringContaining('404 Not Found'),
        expect.any(Function)
      );
      // Returning without closing would hold the file descriptor open for as
      // long as the peer wanted it.
      const [, onFlush] = s.end.mock.calls[0];
      onFlush();
      expect(s.destroy).toHaveBeenCalled();
    }
  );

  it('owns the error handler on a socket it is about to refuse', () => {
    const s = socket();

    upgrade({ url: '/nope', headers: {} }, s, Buffer.alloc(0));

    // Node removes its own handler before emitting `upgrade`. Without this an
    // EPIPE from a peer that hung up mid-handshake is an uncaught exception.
    expect(s.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('registers the connection logger once, not per upgrade', () => {
    const connectionListeners = mockWss.on.mock.calls.filter(
      ([event]) => event === 'connection'
    );
    expect(connectionListeners).toHaveLength(1);

    upgrade({ url: TRPC_WS_PATH, headers: {} }, socket(), Buffer.alloc(0));

    expect(
      mockWss.on.mock.calls.filter(([event]) => event === 'connection')
    ).toHaveLength(1);
  });
});
