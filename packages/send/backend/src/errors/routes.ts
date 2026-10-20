import { NextFunction, Request, RequestHandler, Response } from 'express';
import { BaseError } from './models';

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
  ITEM_NOT_FOUND: {
    statusCode: 404,
    message: 'Could not find item.',
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
const REQ_VAR_OVERRIDES = 'REQ_VAR_OVERRIDES';

// Returns a middleware function that adds error information to the request object.
// `overrides` maps a model error type (the message of a thrown `BaseError`)
// to the response that should be sent for it instead of `err`.
export function addErrorHandling(
  err: ErrorRespInfo,
  overrides?: Record<string, ErrorRespInfo>
): RequestHandler {
  const { statusCode, message } = err;
  return (req, res, next) => {
    req[REQ_VAR_STATUS_CODE] = statusCode;
    req[REQ_VAR_USER_MESSAGE] = message;
    req[REQ_VAR_OVERRIDES] = overrides;
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

// Global error handler middleware.
// Uses the error status code and message
// if added by `addErrorHandling`.
// Falls back to a generic status 500 and the
// message from the `err` object.
// Express only treats a middleware as an error handler when it declares four
// parameters.
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // A response is already on its way; let Express close the connection.
  if (res.headersSent) {
    return next(err);
  }
  const override: ErrorRespInfo | undefined =
    err instanceof BaseError
      ? req[REQ_VAR_OVERRIDES]?.[err.message]
      : undefined;
  // Without route information, keep a client error's own status (body
  // parser, http-errors) and never echo a server error's message.
  const errStatus = (err as { status?: number }).status;
  const fallbackStatus =
    errStatus !== undefined && errStatus >= 400 && errStatus < 500
      ? errStatus
      : 500;
  const status =
    override?.statusCode ?? req[REQ_VAR_STATUS_CODE] ?? fallbackStatus;
  const message =
    override?.message ??
    req[REQ_VAR_USER_MESSAGE] ??
    (status < 500 ? err.message : 'Internal Server Error');

  res.status(status).json({
    status: 'error',
    statusCode: status,
    message: message,
  });

  // The log keeps the original error message; the response may not.
  if (status >= 500) {
    console.error(
      `${status} - ${req.method} ${req.originalUrl} - ${req.ip} - ${err.message} `
    );
  } else {
    console.warn(
      `${status} - ${req.method} ${req.originalUrl} - ${req.ip} - ${message} `
    );
  }
}
