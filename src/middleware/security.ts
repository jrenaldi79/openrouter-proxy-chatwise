/**
 * Security middleware configuration
 */

import { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { envConfig } from '../config/environment';

/**
 * Configure trust proxy settings
 */
export function configureTrustProxy(app: Express): void {
  // Trust proxy for Cloud Run (required for rate limiting)
  // Only set trust proxy in production to avoid rate limiting issues in local development
  if (envConfig.NODE_ENV === 'production') {
    app.set('trust proxy', true);
  }
}

/**
 * Security middleware - skip for specific endpoints to match OpenRouter headers
 */
export function securityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    req.path === '/v1/credits' ||
    req.path === '/api/v1/credits' ||
    req.path === '/api/v1/me/credits' ||
    req.path === '/v1/models' ||
    req.path === '/v1/auth/key' ||
    req.path === '/v1/chat/completions'
  ) {
    // Skip helmet for these endpoints to match OpenRouter exactly
    return next();
  }
  helmet()(req, res, next);
}

/**
 * Configure rate limiting
 */
export function configureRateLimit(app: Express): void {
  // Skip rate limiting in test environment to avoid test interference
  if (envConfig.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
    const limiter = rateLimit({
      windowMs: envConfig.RATE_LIMIT_WINDOW_MS,
      max: envConfig.RATE_LIMIT_MAX_REQUESTS,
      message: {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          correlationId: '',
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use(limiter);
  }
}

/**
 * Apply all security middleware
 */
export function applySecurity(app: Express): void {
  // Disable Express.js headers to match OpenRouter exactly
  app.disable('x-powered-by');

  // Trust proxy configuration
  configureTrustProxy(app);

  // Security middleware
  app.use(securityMiddleware);
  app.use(cors());

  // Rate limiting
  configureRateLimit(app);
}
