/**
 * Correlation ID middleware for request tracking
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';

/**
 * Correlation ID and debug logging middleware
 */
export function correlationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const correlationId = uuidv4();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  // Log the request
  Logger.request(req.method, req.path, correlationId);

  Logger.debug(`Request headers and body logged`, correlationId, {
    headers: req.headers,
    body: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
  });

  next();
}
