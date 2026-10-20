import { NextFunction, Request, RequestHandler, Response } from 'express';

type ErrorRespInfo = {
  statusCode: number;
  message: string;
};

export const AUTH_ERRORS = {
  AUTH_FAILED: {
    statusCode: 401,
    message: 'Authorization failed.',
  },
  LOG_IN_FAILED: {
    statusCode: 500,
    message: 'Could not log in.',
  },
  LOG_OUT_FAILED: {
    statusCode: 500,
    message: 'Could not log out.',
  },
  ALLOW_LIST_FAILED: {
    statusCode: 401,
    message: 'Not in allow list.',
  },
};

export const CONTAINER_ERRORS = {
  ACCESS_LINKS_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not get access links.',
  },
  CONTAINER_NOT_CREATED: {
    statusCode: 500,
    message: 'Could not create container.',
  },
  CONTAINER_NOT_DELETED: {
    statusCode: 500,
    message: 'Could not delete container.',
  },
  CONTAINER_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not find container.',
  },
  CONTAINER_NOT_RENAMED: {
    statusCode: 500,
    message: 'Could not rename container.',
  },
  INFO_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not get container information.',
  },
  ITEM_NOT_CREATED: {
    statusCode: 500,
    message: 'Could not create item.',
  },
  ITEM_NOT_DELETED: {
    statusCode: 500,
    message: 'Could not delete item.',
  },
  ITEM_NOT_RENAMED: {
    statusCode: 500,
    message: 'Could not rename item.',
  },
  ITEM_NOT_REPORTED: {
    statusCode: 500,
    message: 'Could not report item.',
  },
};

export const SHARING_ERRORS = {
  ACCESS_LINK_NOT_CREATED: {
    statusCode: 500,
    message: 'Could not create access link.',
  },
  ACCESS_LINK_NOT_DELETED: {
    statusCode: 500,
    message: 'Could not delete access link.',
  },
  ACCESS_LINK_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not find access link.',
  },
  CHALLENGE_FAILED: {
    statusCode: 403,
    message: 'Failed access link challenge.',
  },
  CHALLENGE_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not get access link challenge.',
  },
  CONTAINER_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not find container for access link.',
  },
  NOT_BURNED: {
    statusCode: 500,
    message: 'Could not burn container.',
  },
};

export const UPLOAD_ERRORS = {
  FILE_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not get file.',
  },
  NOT_CREATED: {
    statusCode: 500,
    message: 'Could not upload file.',
  },
  NO_BUCKET: {
    statusCode: 500,
    message: 'Could not get url for bucket.',
  },
  REPORT_FAILED: {
    statusCode: 404,
    message: 'Could not report upload.',
  },
  INVALID_SIZE: {
    statusCode: 400,
    message: 'A valid file size is required.',
  },
};

export const USER_ERRORS = {
  BACKUP_FAILED: {
    statusCode: 500,
    message: 'Could not make backup.',
  },
  BACKUP_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not retrieve backup.',
  },
  DEV_LOGIN_FAILED: {
    statusCode: 500,
    message: 'Could not perform dev-only login.',
  },
  FOLDERS_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not get user folders.',
  },
  PROFILE_NOT_UPDATED: {
    statusCode: 500,
    message: 'Could not update user profile.',
  },
  PUBLIC_KEY_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not get public key.',
  },
  SESSION_NOT_FOUND: {
    statusCode: 500,
    message: 'Could not get user session.',
  },
  USER_NOT_CREATED: {
    statusCode: 500,
    message: 'Could not create user.',
  },
  USER_NOT_DELETED: {
    statusCode: 500,
    message: 'Could not delete user data.',
  },
};

// Identifies the request variables used by the middleware in this file.
const REQ_VAR_STATUS_CODE = 'REQ_VAR_STATUS_CODE';
const REQ_VAR_USER_MESSAGE = 'REQ_VAR_USER_MESSAGE';

// Returns a middleware function that adds error information to the request object
export function addErrorHandling(err: ErrorRespInfo): RequestHandler {
  const { statusCode, message } = err;
  return (req, res, next) => {
    req[REQ_VAR_STATUS_CODE] = statusCode;
    req[REQ_VAR_USER_MESSAGE] = message;
    next();
  };
}

/**
 * Accepts an async route handler.
 * Any errors thrown will be passed to the global error handler middleware.
 */
export function wrapAsyncHandler(fn: RequestHandler) {
  return function (req: Request, res: Response, next: NextFunction) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  } as RequestHandler;
}

type HttpError = Error & {
  status?: number;
  statusCode?: number;
  expose?: boolean;
};

// Global error handler middleware. Express only routes errors to middleware
// with four parameters, so `next` must stay in the signature.
// Uses the status code and message added by `addErrorHandling`. Otherwise,
// like Express's default handler: honors an http-error status (e.g. 400/413
// from the body parser) and only exposes messages flagged `expose`.
export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) {
    // Let Express's default handler close the connection.
    return next(err);
  }

  const errStatus = err.status ?? err.statusCode;
  const isHttpStatus =
    typeof errStatus === 'number' && errStatus >= 400 && errStatus < 600;
  const status = req[REQ_VAR_STATUS_CODE] ?? (isHttpStatus ? errStatus : 500);
  const message =
    req[REQ_VAR_USER_MESSAGE] ??
    (err.expose && err.message ? err.message : 'Internal Server Error');

  res.status(status).json({
    status: 'error',
    statusCode: status,
    message: message,
  });

  if (status === 500) {
    console.error(
      `${status} - ${req.method} ${req.originalUrl} - ${req.ip} - ${message} `
    );
  } else {
    console.warn(
      `${status} - ${req.method} ${req.originalUrl} - ${req.ip} - ${message} `
    );
  }
}
