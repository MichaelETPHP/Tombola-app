import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { translate } from '../lib/i18n.js';

/**
 * Application-level error class with HTTP status code.
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Centralized error handler for the Hono app.
 * Maps known error types to appropriate JSON responses.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const t = c.get('t');
  // Zod validation errors → 400
  if (err instanceof ZodError) {
    return c.json(
      {
        error: translate(t, 'common.validationFailed'),
        code: 'VALIDATION_FAILED',
        requestId: c.get('requestId'),
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
      400
    );
  }

  // Application errors → custom status code
  if (err instanceof AppError) {
    return c.json(
      {
        error: translate(t, err.message),
        code: err.message.includes('.') ? err.message.replaceAll('.', '_').toUpperCase() : 'APPLICATION_ERROR',
        requestId: c.get('requestId'),
        ...(err.details !== undefined && { details: err.details }),
      },
      err.statusCode as 400
    );
  }

  // JWT / auth errors
  if (err.name === 'JWTExpired' || err.name === 'JWTClaimValidationFailed') {
    return c.json({ error: translate(t, 'auth.invalidToken'), code: 'AUTH_INVALID_TOKEN', requestId: c.get('requestId') }, 401);
  }

  // Unexpected errors → 500
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    name: err.name,
  });

  const isDev = process.env.NODE_ENV !== 'production';

  return c.json(
    {
      error: translate(t, 'common.internalError'),
      code: 'INTERNAL_ERROR',
      requestId: c.get('requestId'),
      ...(isDev && { message: err.message, stack: err.stack }),
    },
    500
  );
};
