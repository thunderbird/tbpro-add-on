import { TRPC_WS_PATH } from '@send-backend/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockValidateJWT, mockUploadHandler, mockUploadServer, mockWss } =
  vi.hoisted(() => ({
    mockValidateJWT: vi.fn(),
    mockUploadHandler: vi.fn(),
    mockUploadServer: { handleUpgrade: vi.fn(), emit: vi.fn() },
    mockWss: {
      handleUpgrade: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      clients: new Set(),
    },
  }));

vi.mock('../../auth/jwt', () => ({ validateJWT: mockValidateJWT }));
vi.mock('../../wsUploadHandler', () => ({ default: mockUploadHandler }));
vi.mock('../../index', () => ({
  wss: mockWss,
  wsUploadServer: mockUploadServer,
}));
vi.mock('../../sentry', () => ({}));

import { wsHandler } from '../../ws/setup';

const UPLOAD_PATH = '/api/ws';

/**
 * `/api/ws` hands the socket to an upload handler that streams into storage on
 * the server's own credentials. The upgrade used to be performed with no token
 * check at all, so anyone who could reach the host could write to the bucket
 * (private-issue-tracking#44).
 */
describe('wsHandler', () => {
  let upgrade: (req, socket, head) => void;
  const socket = () => ({ on: vi.fn(), end: vi.fn(), destroy: vi.fn() });

  const authedCookie =
    'authorization=Bearer%20token;refresh_token=Bearer%20refresh';

  beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` clears calls but keeps implementations, so without an
    // explicit default a test that sets 'valid' leaks it into the next one --
    // which quietly turned the no-token cases below into no-ops. Unauthenticated
    // is the safe default to leak.
    mockValidateJWT.mockReturnValue(null);
    const server = { on: vi.fn() };
    wsHandler(server);
    upgrade = server.on.mock.calls.find(([event]) => event === 'upgrade')[1];
  });

  it('refuses an unauthenticated upgrade to the upload path with 401', () => {
    mockValidateJWT.mockReturnValue(null);
    const s = socket();

    upgrade({ url: UPLOAD_PATH, headers: {} }, s, Buffer.alloc(0));

    expect(mockUploadServer.handleUpgrade).not.toHaveBeenCalled();
    expect(mockUploadHandler).not.toHaveBeenCalled();
    expect(s.end).toHaveBeenCalledWith(
      expect.stringContaining('401 Unauthorized'),
      expect.any(Function)
    );
  });

  // An expired access token cannot be refreshed over a handshake that is being
  // answered right now, so only 'valid' gets through.
  it.each(['shouldRefresh', 'shouldLogin'])(
    'refuses the upload path when the token is %s',
    (result) => {
      mockValidateJWT.mockReturnValue(result);
      const s = socket();

      upgrade(
        { url: UPLOAD_PATH, headers: { cookie: authedCookie } },
        s,
        Buffer.alloc(0)
      );

      expect(mockUploadServer.handleUpgrade).not.toHaveBeenCalled();
      expect(s.end).toHaveBeenCalledWith(
        expect.stringContaining('401'),
        expect.any(Function)
      );
    }
  );

  it('upgrades the upload path for a valid session', () => {
    mockValidateJWT.mockReturnValue('valid');
    const s = socket();

    upgrade(
      { url: UPLOAD_PATH, headers: { cookie: authedCookie } },
      s,
      Buffer.alloc(0)
    );

    expect(mockUploadServer.handleUpgrade).toHaveBeenCalled();
    expect(s.end).not.toHaveBeenCalled();
  });

  // Do not "harden" this one to match the upload path. Logging in happens over
  // it: `LoginPage.vue` subscribes to `onLoginFinished` before the user has a
  // session, and that subscription needs the socket. The procedure is
  // deliberately not behind `isAuthed` and returns early if a session already
  // exists (`trpc/users.ts:156`). Requiring a token here would deadlock login --
  // you would need to be logged in to find out that you had logged in.
  // `onVerificationRequested`, `onVerificationFinished` and `onPassphraseShared`
  // are the same shape.
  it(`upgrades ${TRPC_WS_PATH} with no token, which login depends on`, () => {
    const s = socket();

    upgrade({ url: TRPC_WS_PATH, headers: {} }, s, Buffer.alloc(0));

    expect(mockWss.handleUpgrade).toHaveBeenCalled();
    expect(s.end).not.toHaveBeenCalled();
  });

  it(`upgrades ${TRPC_WS_PATH} even when the token present is invalid`, () => {
    // A stale or malformed cookie must not stop someone from logging in again.
    mockValidateJWT.mockReturnValue(null);
    const s = socket();

    upgrade(
      { url: TRPC_WS_PATH, headers: { cookie: 'authorization=Bearer%20junk' } },
      s,
      Buffer.alloc(0)
    );

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
