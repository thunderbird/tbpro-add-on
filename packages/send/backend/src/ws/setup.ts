// Configure sentry
import { TRPC_WS_PATH } from '@send-backend/config';
import '../sentry';

import { logger } from '@send-backend/utils/logger';
import 'dotenv/config';
import { wss } from '../index';

/**
 * Refuse an upgrade with a real HTTP response.
 *
 * An upgrade never reaches express, so there is no `res` to answer with. Left
 * to itself the socket would simply die, which every reverse proxy in front of
 * us reports as a 502 for what is actually a deliberate refusal.
 */
function refuse(socket, status: number, reason: string) {
  // Node strips its own error handler from the socket before emitting
  // `upgrade`, and nothing else owns this one, so an unhandled EPIPE or
  // ECONNRESET from a peer that hung up mid-handshake would take the whole
  // process down. `ws` guards the accepted branch the same way, as the first
  // thing `handleUpgrade` does.
  socket.on('error', () => {});

  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\n` +
      'Connection: close\r\n' +
      'Content-Length: 0\r\n' +
      '\r\n',
    // Destroy once the write has flushed. `end()` alone only half-closes, so a
    // peer that never sends its own FIN would keep the socket around.
    () => socket.destroy()
  );
}

export const wsHandler = (server) => {
  // Registered once, not per upgrade. Inside the upgrade callback this added a
  // fresh listener for every connection, which only went unnoticed because
  // `index.ts` sets `defaultMaxListeners = 0` and silences the warning.
  wss.on('connection', (ws) => {
    logger.log(`➕➕ Connection (${wss.clients.size})`);
    ws.once('close', () => {
      logger.log(`➖➖ Connection (${wss.clients.size})`);
    });
  });

  server.on('upgrade', (req, socket, head) => {
    // Intentionally open, and it must stay that way: logging in happens over
    // this socket. `LoginPage.vue` subscribes to `onLoginFinished` before the
    // user has a session, so requiring a token here would deadlock login. The
    // procedures behind it gate themselves -- the authenticated ones use
    // `isAuthed`, and the login/verification subscriptions are public by design
    // (`trpc/users.ts:156`).
    if (req.url === TRPC_WS_PATH) {
      logger.log(`✅ WebSocket Server listening on ${TRPC_WS_PATH}`);
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return;
    }

    // Everything else is answered and closed. That now includes `/api/ws`:
    // gated on a session in #1153, refused wherever storage was a bucket in
    // #1158, and removed outright here. The handler behind it wrote through
    // `FileStore.set` on the server's own credentials, and the browser no
    // longer has any code that reaches it: every upload is a presigned PUT.
    // `/api/messagebus` went the same way. Returning without closing leaves
    // the connection open and holds a file descriptor for as long as the
    // peer wants it, which is what an unmatched url used to do.
    refuse(socket, 404, 'Not Found');
  });
};
