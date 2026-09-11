import { NextFunction, Request, Response } from 'express';
import { getAllowedOrigins } from './auth/client';
import { X_LOGOUT_HEADER } from './config';
import cors from 'cors';

// Resolved lazily (not at module load) so importing this module — e.g. for
// `isAddonRequest` in route files — has no side effects and doesn't require
// `getAllowedOrigins` to be wired up.
let cachedAllowedOrigins: string[] | undefined;
function allowedOriginsList(): string[] {
  if (!cachedAllowedOrigins) {
    cachedAllowedOrigins = getAllowedOrigins();
  }
  return cachedAllowedOrigins;
}

// The Thunderbird add-on is told apart from the webmail frontend so we can gate
// add-on-only backwards-compat behaviour — e.g. skipping the required `size` on
// /uploads/signed until the add-on is patched (private #36 regression).
//
// Two signals, primary first:
//   1. User-Agent: the add-on's HTTP requests run inside Thunderbird's Gecko
//      engine, so the UA carries `Thunderbird/<version>`. This is the reliable
//      "this is really Thunderbird" signal (a normal web page can't set it).
//   2. Origin: the add-on runs from an extension origin (`moz-extension://...`)
//      while the webmail frontend does not. Kept as a secondary signal and used
//      for CORS below.
// Either match counts as an add-on request, so a UA override that drops the
// Thunderbird token still falls back to the extension origin.
export const EXTENSION_ORIGIN_PREFIX = 'moz-extension://';
const THUNDERBIRD_UA_TOKEN = 'thunderbird';

export function isExtensionOrigin(origin: string | undefined): boolean {
  return (
    typeof origin === 'string' && origin.startsWith(EXTENSION_ORIGIN_PREFIX)
  );
}

export function isThunderbirdUserAgent(userAgent: string | undefined): boolean {
  return (
    typeof userAgent === 'string' &&
    userAgent.toLowerCase().includes(THUNDERBIRD_UA_TOKEN)
  );
}

/**
 * True when the request came from the Thunderbird add-on — by User-Agent
 * (`Thunderbird/...`, primary) or, as a fallback, the extension origin.
 */
export function isAddonRequest(req: Request): boolean {
  const userAgent = req.headers['user-agent'] ?? req.headers['User-Agent'];
  return (
    isThunderbirdUserAgent(
      Array.isArray(userAgent) ? userAgent[0] : userAgent
    ) || isExtensionOrigin(req.headers.origin)
  );
}

export const originsHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const origin = req.headers.origin;

  const allowedOrigins = allowedOriginsList();

  // Check if it's a Thunderbird extension origin
  if (isExtensionOrigin(origin)) {
    allowedOrigins.push(origin);
  }

  // Allow any matching origin
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by CORS'));
      }
    },
    credentials: true,
    // Expose the forced-logout header so the browser can read it cross-origin (#960)
    exposedHeaders: [X_LOGOUT_HEADER],
  })(req, res, next);
};
