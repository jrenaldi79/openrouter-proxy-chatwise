/**
 * Proxy routes for /v1/auth/key endpoint
 */

import { Request, Response } from 'express';
import { proxyService } from '../config/services';
import {
  createOpenRouterRequest,
  isCloudflareBlocked,
  handleCloudflareBlock,
  sendCleanResponse,
  ProxyErrorResponse,
} from './proxy-utils';

/**
 * Mock auth response for Cloudflare fallback
 */
const MOCK_AUTH_RESPONSE = {
  data: {
    name: 'Local Development Mock',
    models: ['gpt-3.5-turbo', 'gpt-4', 'claude-3-haiku'],
    api_key: 'mock-key',
    monthly_limit: 100000,
    usage: 0,
    is_valid: true,
  },
};

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

    // Check if we got blocked by Cloudflare (HTML response instead of JSON)
    if (isCloudflareBlocked(proxyResponse.data)) {
      // Enhance mock response with actual API key if available
      const mockResponse = {
        ...MOCK_AUTH_RESPONSE,
        data: {
          ...MOCK_AUTH_RESPONSE.data,
          api_key:
            req.headers.authorization?.replace('Bearer ', '') || 'mock-key',
        },
      };

      const handled = handleCloudflareBlock(
        req,
        res,
        correlationId,
        mockResponse
      );
      if (handled) return;
    }

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
