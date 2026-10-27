// Configure sentry
import * as trpcExpress from '@trpc/server/adapters/express';
import * as t from './trpc';
// We need to import this before importing any other modules that use BigInt
import './utils/bigint';

import swaggerUi from 'swagger-ui-express';
import './sentry';

import cookieParser from 'cookie-parser';
import 'dotenv/config';
import express from 'express';

import indexroutes from './routes';
import auth from './routes/auth';
import containers from './routes/containers';
import download from './routes/download';
import internal from './routes/internal';
import oidcAuth from './routes/oidc-auth';
import sharing from './routes/sharing';
import uploads from './routes/uploads';
import users from './routes/users';

import * as Sentry from '@sentry/node';

import helmet from 'helmet';
import { errorHandler } from './errors/routes';
import { startOrphanSweepSchedule } from './jobs/orphanSweep';
import { addVersionHeader } from './middleware';
import { originsHandler } from './origins';
import { getRedisClient, isRateLimitingEnabled } from './redis';
import metricsRoute from './routes/metrics';
import { openapiSpecification } from './swagger';
import { createContext } from './trpc/context';
import { appRouter } from './router';

const PORT = 8080;
const HOST = '0.0.0.0';
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

/* tRPC (HTTP only) */

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
app.use('/api/auth', auth);
app.use('/api/auth', oidcAuth);
app.use('/api/internal', internal);
app.use(metricsRoute);
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

if (isRateLimitingEnabled()) {
  try {
    getRedisClient();
  } catch (err) {
    console.error('Failed to start the Redis connection at boot:', err);
  }
}

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server ready at: http://${HOST}:${PORT}`);
});

startOrphanSweepSchedule();
