/**
 * Proxy routes for /v1/auth/key endpoint
 */

import { Request, Response } from 'express';
import { proxyService } from '../config/services';
import {
  createOpenRouterRequest,
  sendCleanResponse,
  ProxyErrorResponse,
} from './proxy-utils';

/**
 * Special handling for /v1/auth/key endpoint
 */
export async function v1AuthKeyHandler(
  req: Request,
  res: Response
): Promise<void> {
  const correlationId = req.correlationId as string;

  try {
    // Create OpenRouter request - need to reconstruct full path with /api prefix
    const fullPath = req.path.replace('/v1', '/api/v1');
    const openRouterRequest = createOpenRouterRequest(
      req,
      fullPath,
      correlationId
    );

    // Make request to OpenRouter
    const proxyResponse = await proxyService.makeRequest(openRouterRequest);

    // Handle error responses
    if (proxyResponse.status >= 400) {
      const errorResponse: ProxyErrorResponse = {
        error: {
          code: 'UPSTREAM_ERROR',
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

      sendCleanResponse(
        res,
        proxyResponse.status,
        errorResponse,
        correlationId
      );
      return;
    }

    // Send clean response with headers matching OpenRouter exactly
    sendCleanResponse(
      res,
      proxyResponse.status,
      proxyResponse.data,
      correlationId
    );
  } catch (error) {
    const errorResponse: ProxyErrorResponse = {
      error: {
        code: 'UPSTREAM_ERROR',
        message:
          error instanceof Error ? error.message : 'OpenRouter API unavailable',
        correlationId,
      },
    };
    sendCleanResponse(res, 502, errorResponse, correlationId);
  }
}
