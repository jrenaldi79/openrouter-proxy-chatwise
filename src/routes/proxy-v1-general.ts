/**
 * Proxy routes for general /v1/* endpoints
 */

import { Request, Response, NextFunction } from 'express';
import https from 'https';
import url from 'url';
import { proxyService } from '../config/services';
import { envConfig } from '../config/environment';
import { Logger } from '../utils/logger';
import {
  createOpenRouterRequest,
  isCloudflareBlocked,
  handleCloudflareBlock,
  mapStatusToErrorCode,
  sendCleanResponse,
  ProxyErrorResponse,
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
 * Handle streaming requests with direct HTTP proxy
 */
function handleStreamingRequest(
  req: Request,
  res: Response,
  correlationId: string
): void {
  const targetUrl = `${envConfig.OPENROUTER_BASE_URL}/api/v1${req.path}`;
  const proxyHeaders = { ...req.headers };
  proxyHeaders['host'] = new URL(envConfig.OPENROUTER_BASE_URL).host;
  delete proxyHeaders['content-length']; // Let the proxy recalculate

  const targetOptions = url.parse(targetUrl) as url.UrlWithStringQuery & {
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
  };
  targetOptions.method = req.method;
  targetOptions.headers = proxyHeaders;

  const proxyReq = https.request(
    targetOptions,
    (proxyRes: import('http').IncomingMessage) => {
      // Forward status and headers
      res.status(proxyRes.statusCode || 500);

      // Forward headers but clean them up
      const responseHeaders = { ...proxyRes.headers };
      delete responseHeaders['transfer-encoding'];
      res.set(responseHeaders);

      // Pipe the streaming response directly
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error: Error) => {
    Logger.error('Streaming proxy error', correlationId, {
      error: error.message,
      stack: error.stack,
    });
    if (!res.headersSent) {
      res.status(502).json({
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'Failed to connect to OpenRouter API',
          correlationId,
        },
      });
    }
  });

  // Forward the request body for POST requests
  if (req.method === 'POST' && req.body) {
    proxyReq.write(JSON.stringify(req.body));
  }

  proxyReq.end();
}

/**
 * Proxy passthrough for /v1/* endpoints (for chat applications that use the shorter path)
 */
export async function v1ProxyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip if this is the credits endpoint (already handled above)
  // Note: /v1/auth/key and /v1/models are now handled by specific routes above
  if (req.path === '/credits' && req.method === 'GET') {
    return next();
  }

  const correlationId = req.correlationId as string;

  try {
    // Check if this is a streaming request
    const isStreamingRequest = req.body && req.body.stream === true;

    if (isStreamingRequest) {
      // For streaming requests, use direct HTTP proxy to maintain stream
      handleStreamingRequest(req, res, correlationId);
      return;
    }

    // For non-streaming requests, use the existing ProxyService
    const fullPath = `/api/v1${req.path}`;
    const openRouterRequest = createOpenRouterRequest(
      req,
      fullPath,
      correlationId
    );

    // Make request to OpenRouter
    const proxyResponse = await proxyService.makeRequest(openRouterRequest);

    // Check if we got blocked by Cloudflare (HTML response instead of JSON)
    if (isCloudflareBlocked(proxyResponse.data)) {
      // For /models endpoint, use specific mock response
      if (req.path === '/models') {
        const handled = handleCloudflareBlock(
          req,
          res,
          correlationId,
          MOCK_MODELS_RESPONSE
        );
        if (handled) return;
      }

      // For other endpoints, log and continue with original error handling
      Logger.info(`Cloudflare blocked endpoint: ${req.path}`, correlationId);
    }

    // For /v1/chat/completions, use clean headers to match OpenRouter exactly
    if (req.path === '/chat/completions') {
      sendCleanResponse(
        res,
        proxyResponse.status,
        proxyResponse.data,
        correlationId
      );
      return;
    }

    // Handle error responses
    if (proxyResponse.status >= 400) {
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
    const errorResponse: ProxyErrorResponse = {
      error: {
        code: 'UPSTREAM_ERROR',
        message:
          error instanceof Error ? error.message : 'OpenRouter API unavailable',
        correlationId,
      },
    };
    res.status(502).json(errorResponse);
  }
}
