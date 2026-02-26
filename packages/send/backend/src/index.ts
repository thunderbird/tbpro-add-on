// Configure sentry
import * as trpcExpress from '@trpc/server/adapters/express';
import * as t from './trpc';
// We need to import this before importing any other modules that use BigInt
import './utils/bigint';

import { applyWSSHandler } from '@trpc/server/adapters/ws';
import swaggerUi from 'swagger-ui-express';
import './sentry';

import cookieParser from 'cookie-parser';
import 'dotenv/config';
import express from 'express';
import WebSocket from 'websocket';

import indexroutes from './routes';
import auth from './routes/auth';
import containers from './routes/containers';
import download from './routes/download';
import fxa from './routes/fxa';
import oidcAuth from './routes/oidc-auth';
import sharing from './routes/sharing';
import tags from './routes/tags';
import uploads from './routes/uploads';
import users from './routes/users';
import verifyroute from './routes/verify';

import * as Sentry from '@sentry/node';

import events from 'events';
import helmet from 'helmet';
import { TRPC_WS_PATH } from './config';
import { errorHandler } from './errors/routes';
import { addVersionHeader } from './middleware';
import { originsHandler } from './origins';
import metricsRoute from './routes/metrics';
import { openapiSpecification } from './swagger';
import { createContext } from './trpc/context';
import { appRouter } from './router';
import { wsHandler } from './ws/setup';

const PORT = 8080;
const HOST = '0.0.0.0';
export const wsUploadServer = new WebSocket.Server({ noServer: true });
export const wsMessageServer = new WebSocket.Server({ noServer: true });

// We use this websocket for general purposes. Not related to uploads/chat.
// We want to keep them separate in case we need to deprecate any of them
export const wss = new WebSocket.Server({ path: TRPC_WS_PATH, noServer: true });

events.EventEmitter.defaultMaxListeners = 0;

const app = express();
app.use(express.static('public'));
app.use(express.json({ limit: '5mb' }));

app.use(originsHandler);

app.set('trust proxy', 1); // trust first proxy
app.use(cookieParser());
app.use(addVersionHeader);

// This Content Security Policy (CSP) restricts which sources the browser can load content from, helping prevent XSS, data injection, and clickjacking attacks.
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ['https:', 'data:'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  })
);

// Security headers
app.use(
  helmet({
    frameguard: { action: 'sameorigin' }, // X-Frame-Options
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: ["'none'"], // CSP alternative to X-Frame-Options
      },
    },
    referrerPolicy: { policy: 'no-referrer' }, // Optional, good practice
    // X-Content-Type-Options and others are enabled by default
  })
);

// HSTS is a separate middleware because it requires HTTPS
app.use(
  helmet.hsts({
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
  })
);

export const router = t.router;
export const publicProcedure = t.publicProcedure;
export const mergeRouters = t.mergeRouters;

/* tRPC */

const trpcWebsocket = applyWSSHandler({
  wss,
  router: appRouter,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createContext: createContext as any,
  // Enable heartbeat messages to keep connection open (disabled by default)
  keepAlive: {
    enabled: true,
    // server ping message interval in milliseconds
    pingMs: 30000,
    // connection is terminated if pong message is not received in this many milliseconds
    pongWaitMs: 5000,
  },
});

process.on('SIGTERM', () => {
  trpcWebsocket.broadcastReconnectNotification();
  wss.close();
});

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// REST API routes
app.use('/', indexroutes);
app.use('/api/users', users);
app.use('/api/containers', containers);
app.use('/api/uploads', uploads);
app.use('/api/download', download);
app.use('/api/sharing', sharing);
app.use('/api/tags', tags);
app.use('/lockbox/fxa', fxa);
app.use('/fxa', fxa);
app.use('/api/lockbox/fxa', fxa);
app.use('/api/auth', auth);
app.use('/api/auth', oidcAuth);
app.use(metricsRoute);
app.use('/api/verify', verifyroute);
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiSpecification, { explorer: true })
);

// This should be the last route. Anything below it will 404
app.use((_, res) => res.status(404).send('404 Not Found'));

// Add this after all routes,
// but before any and other error-handling middlewares are defined
Sentry.setupExpressErrorHandler(app);

// errorHandler needs to be final middleware registered.
app.use(errorHandler);

const server = app.listen(PORT, HOST, async () => {
  console.log(`🚀 Server ready at: http://${HOST}:${PORT}`);
});

wsHandler(server);
