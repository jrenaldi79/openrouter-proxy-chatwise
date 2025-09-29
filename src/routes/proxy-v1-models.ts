/**
 * Proxy routes for /v1/models endpoint
 */

import { Request, Response } from 'express';
import { proxyService } from '../config/services';
import {
  validateAuth,
  createOpenRouterRequest,
  isCloudflareBlocked,
  handleCloudflareBlock,
  mapStatusToErrorCode,
  sendCleanResponse,
  ProxyErrorResponse
} from './proxy-utils';

/**
 * Mock models response for Cloudflare fallback
 */
const MOCK_MODELS_RESPONSE = {
  data: [
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      pricing: { prompt: '0.0015', completion: '0.002' },
    },
    {
      id: 'gpt-4',
      name: 'GPT-4',
      pricing: { prompt: '0.03', completion: '0.06' },
    },
    {
      id: 'claude-3-haiku',
      name: 'Claude 3 Haiku',
      pricing: { prompt: '0.00025', completion: '0.00125' },
    },
    {
      id: 'google/gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      pricing: { prompt: '0.00075', completion: '0.003' },
    },
  ],
};

/**
 * Special handling for /v1/models endpoint
 */
export async function v1ModelsHandler(req: Request, res: Response): Promise<void> {
  const correlationId = req.correlationId as string;

  try {
    // Validate authorization early for security
    const { errorResponse } = validateAuth(req);
    if (errorResponse) {
      res.status(401).json(errorResponse);
      return;
    }

    // Create OpenRouter request - need to reconstruct full path with /api prefix
    const fullPath = req.path.replace('/v1', '/api/v1');
    const openRouterRequest = createOpenRouterRequest(req, fullPath, correlationId);

    // Make request to OpenRouter
    const proxyResponse = await proxyService.makeRequest(openRouterRequest);

    // Check if we got blocked by Cloudflare (HTML response instead of JSON)
    if (isCloudflareBlocked(proxyResponse.data)) {
      const handled = handleCloudflareBlock(req, res, correlationId, MOCK_MODELS_RESPONSE);
      if (handled) return;
    }

    // Handle error responses
    if (proxyResponse.status >= 400) {
      // For authentication errors (401), pass through original OpenRouter error structure
      if (
        proxyResponse.status === 401 &&
        proxyResponse.data &&
        typeof proxyResponse.data === 'object' &&
        'error' in proxyResponse.data
      ) {
        sendCleanResponse(res, 401, proxyResponse.data, correlationId);
        return;
      }

      const { code: errorCode, statusCode } = mapStatusToErrorCode(proxyResponse.status);
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

      sendCleanResponse(res, statusCode, errorResponse, correlationId);
      return;
    }

    // Send clean response with headers matching OpenRouter exactly
    sendCleanResponse(res, proxyResponse.status, proxyResponse.data, correlationId);
  } catch (error) {
    const errorResponse: ProxyErrorResponse = {
      error: {
        code: 'UPSTREAM_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'OpenRouter API unavailable',
        correlationId,
      },
    };
    sendCleanResponse(res, 502, errorResponse, correlationId);
  }
}