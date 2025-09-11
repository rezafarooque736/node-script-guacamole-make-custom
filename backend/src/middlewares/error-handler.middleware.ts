import { Request, Response, NextFunction } from 'express';
import { logger } from '../configs/logger.config';
import { AppError } from '../types/index';

/**
 * Global error handling middleware.
 * Catches all errors and sends a generic error response.
 * Logs error details using Winston.
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error(`${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

  // Handle operational errors
  if ('isOperational' in err && err.isOperational) {
    const appError = err as AppError;
    res.status(appError.statusCode).json({
      success: false,
      error: {
        code: appError.errorCode,
        message: appError.message,
        ...(process.env.NODE_ENV === 'development' && {
          stack: appError.stack,
        }),
      },
    });
    return;
  }

  // Handle development vs production error responses
  if (process.env.NODE_ENV === 'development') {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message,
        stack: err.stack,
      },
    });
    return;
  }

  // Production error response
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
    },
  });
};
