/**
 * Proxy routes for /api/v1/* endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { proxyService } from '../config/services';
import { Logger } from '../utils/logger';
import {
  validateAuth,
  createOpenRouterRequest,
  mapStatusToErrorCode,
  createErrorResponse,
  ProxyErrorResponse,
} from './proxy-utils';

/**
 * Proxy passthrough for /api/v1/* endpoints
 */
export async function apiV1ProxyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip if this is the credits endpoint (already handled above)
  if (
    (req.path === '/me/credits' || req.path === '/credits') &&
    req.method === 'GET'
  ) {
    return next();
  }

  const correlationId = req.correlationId as string;

  try {
    // Validate authorization early for security
    const { errorResponse } = validateAuth(req);
    if (errorResponse) {
      res.status(401).json(errorResponse);
      return;
    }

    // Create OpenRouter request - need to reconstruct full path
    const fullPath = `/api/v1${req.path}`;
    const openRouterRequest = createOpenRouterRequest(
      req,
      fullPath,
      correlationId
    );

    // Make request to OpenRouter
    const proxyResponse = await proxyService.makeRequest(openRouterRequest);

    // Handle error responses
    if (proxyResponse.status >= 400) {
      // For authentication errors (401), pass through original OpenRouter error structure
      if (
        proxyResponse.status === 401 &&
        proxyResponse.data &&
        typeof proxyResponse.data === 'object' &&
        'error' in proxyResponse.data
      ) {
        res.set('x-correlation-id', correlationId);
        res.status(401).json(proxyResponse.data);
        return;
      }

      const { code: errorCode, statusCode } = mapStatusToErrorCode(
        proxyResponse.status
      );
      const errorResponse: ProxyErrorResponse = {
        error: {
          code: errorCode,
          message:
            typeof proxyResponse.data === 'object' &&
            proxyResponse.data &&
            'error' in proxyResponse.data
              ? (proxyResponse.data as { error: { message?: string } }).error
                  .message || 'OpenRouter API error'
              : 'OpenRouter API error',
          correlationId,
        },
      };

      res.status(statusCode).json(errorResponse);
      return;
    }

    // Forward successful response exactly as received
    const responseHeaders = { ...proxyResponse.headers };
    delete responseHeaders['transfer-encoding']; // Remove transfer-encoding to avoid conflicts

    res.status(proxyResponse.status).set(responseHeaders);

    if (proxyResponse.data !== undefined) {
      res.json(proxyResponse.data);
    } else {
      res.end();
    }
  } catch (error) {
    Logger.error('Proxy API error', correlationId, {
      error: error instanceof Error ? error.message : String(error),
    });
    const errorResponse = createErrorResponse(
      502,
      'OpenRouter API unavailable',
      correlationId
    );
    res.status(502).json(errorResponse);
  }
}
