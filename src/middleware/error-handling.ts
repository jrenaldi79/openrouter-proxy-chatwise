/**
 * Error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';

/**
 * 404 handler for non-API routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  const correlationId = req.correlationId as string;
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      correlationId,
    },
  });
}

/**
 * Global error handler
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.correlationId || uuidv4();

  // Log the error for debugging
  Logger.error('Unhandled error in middleware', correlationId, {
    error: error.message,
    stack: error.stack,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      correlationId,
    },
  });
}
