// Configure sentry
import { TRPC_WS_PATH } from '@send-backend/config';
import '../sentry';

import { logger } from '@send-backend/utils/logger';
import 'dotenv/config';
import { validateJWT } from '../auth/jwt';
import { wsUploadServer, wss } from '../index';
import { getCookie } from '../utils';
import wsUploadHandler from '../wsUploadHandler';

const WS_UPLOAD_PATH = `/api/ws`;

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

/**
 * Is this upgrade request carrying a usable session?
 *
 * Cookies ride along on the upgrade request, so the same JWT the REST routes
 * check is available here. `'valid'` only -- `'shouldRefresh'` means the access
 * token has expired, and there is no way to hand a refreshed one back over a
 * handshake that is being answered right now.
 */
function isAuthenticated(req): boolean {
  const jwtToken = getCookie(req?.headers?.cookie, 'authorization');
  const jwtRefreshToken = getCookie(req?.headers?.cookie, 'refresh_token');

  return validateJWT({ jwtToken, jwtRefreshToken }) === 'valid';
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
    if (req.url === WS_UPLOAD_PATH) {
      // This handler streams straight into storage on the server's own
      // credentials (`wsUploadHandler` -> `FileStore.set`). It used to accept
      // any peer that could reach the host (private-issue-tracking#44).
      if (!isAuthenticated(req)) {
        logger.log(
          `⛔ Refused an unauthenticated upgrade to ${WS_UPLOAD_PATH}`
        );
        return refuse(socket, 401, 'Unauthorized');
      }

      wsUploadServer.handleUpgrade(req, socket, head, (ws) => {
        wsUploadServer.emit('connection', ws, req);
        wsUploadHandler(ws);
      });
      return;
    }

    if (req.url === TRPC_WS_PATH) {
      logger.log(`✅ WebSocket Server listening on ${TRPC_WS_PATH}`);
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return;
    }

    // Everything else, including the `/api/messagebus` path removed here, is
    // answered and closed. Returning without closing leaves the connection open
    // and holds a file descriptor for as long as the peer wants it, which is
    // what an unmatched url used to do.
    refuse(socket, 404, 'Not Found');
  });
};
