/**
 * Body parsing and error handling middleware
 */

import { Express, Request, Response, NextFunction } from 'express';
import express from 'express';

/**
 * Body parser error handler
 */
export function bodyParserErrorHandler(
  error: Error & { type?: string },
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (error.type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload too large',
        correlationId: req.correlationId || 'unknown',
      },
    });
    return;
  }
  next(error);
}

/**
 * Apply body parsing middleware
 */
export function applyBodyParsing(app: Express): void {
  // Body parsing - no size limit for LLM applications that can handle large text
  app.use(express.json({ limit: '100mb' })); // High limit for large LLM inputs
  app.use(express.raw({ type: 'application/octet-stream', limit: '100mb' }));

  // Handle body parser errors (like payload too large)
  app.use(bodyParserErrorHandler);
}