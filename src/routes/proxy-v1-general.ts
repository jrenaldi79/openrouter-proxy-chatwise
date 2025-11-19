/**
 * Proxy routes for general /v1/* endpoints
 */

import { Request, Response, NextFunction } from 'express';
import https from 'https';
import url from 'url';
import { proxyService } from '../config/services';
import { envConfig } from '../config/environment';
import { Logger } from '../utils/logger';
import { isWeaveEnabled } from '../config/weave';
import { createTracedLLMCall } from '../middleware/weave-tracing';
import { isLangfuseEnabled } from '../config/langfuse';
import { createTracedLangfuseLLMCall } from '../middleware/langfuse-tracing';
import {
  createOpenRouterRequest,
  mapStatusToErrorCode,
  sendCleanResponse,
  ProxyErrorResponse,
} from './proxy-utils';

/**
 * Handle streaming requests with direct HTTP proxy and optional tracing
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

  // Get tracing flags from request (set by middleware)
  const hasWeaveData = (req as any).hasWeaveData || false;
  const hasLangfuseData = (req as any).hasLangfuseData || false;
  const shouldTrace = hasWeaveData || hasLangfuseData;

  // Stream accumulation for tracing
  let streamBuffer = '';

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

      // Handle streaming data
      proxyRes.on('data', (chunk: Buffer) => {
        // Accumulate for tracing if needed
        if (shouldTrace) {
          streamBuffer += chunk.toString();
        }

        // Forward to client immediately (real-time streaming)
        res.write(chunk);
      });

      proxyRes.on('end', async () => {
        res.end();

        // Create traces if needed
        if (shouldTrace && streamBuffer) {
          try {
            const { parseAndAccumulateSSE } = await import(
              '../utils/sse-parser'
            );
            const { traceStreamingCompletion } = await import(
              '../utils/async-tracer'
            );

            Logger.info(
              'Stream completed, starting async trace',
              correlationId
            );

            const accumulatedResponse = parseAndAccumulateSSE(
              streamBuffer,
              correlationId
            );

            const chatRequest = req.body as {
              model: string;
              messages: Array<{ role: string; content: string }>;
              temperature?: number;
              max_tokens?: number;
              top_p?: number;
              n?: number;
              presence_penalty?: number;
              frequency_penalty?: number;
            };

            const tracingInput = {
              model: chatRequest.model || 'unknown',
              messages: chatRequest.messages || [],
              temperature: chatRequest.temperature,
              max_tokens: chatRequest.max_tokens,
              top_p: chatRequest.top_p,
              n: chatRequest.n,
              presence_penalty: chatRequest.presence_penalty,
              frequency_penalty: chatRequest.frequency_penalty,
              correlationId,
            };

            await traceStreamingCompletion(
              tracingInput,
              accumulatedResponse,
              correlationId,
              hasWeaveData,
              hasLangfuseData
            );
          } catch (error) {
            Logger.error('Async streaming trace failed', correlationId, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
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
    // If this is a chat completion and observability is enabled, use traced calls
    let proxyResponse;
    const isChatCompletion = req.path === '/chat/completions';
    const hasWeaveData = (req as any).__weaveRequestData;
    const hasLangfuseData = (req as any).__langfuseRequestData;
    const needsTracing =
      isChatCompletion &&
      ((isWeaveEnabled() && hasWeaveData) ||
        (isLangfuseEnabled() && hasLangfuseData));

    if (needsTracing) {
      const requestBody = req.body;

      // Prepare the LLM input parameters (shared by both platforms)
      const llmInput = {
        model: requestBody.model,
        messages: requestBody.messages,
        temperature: requestBody.temperature ?? 1,
        max_tokens: requestBody.max_tokens,
        top_p: requestBody.top_p ?? 1,
        n: requestBody.n ?? 1,
        presence_penalty: requestBody.presence_penalty ?? 0,
        frequency_penalty: requestBody.frequency_penalty ?? 0,
        correlationId, // For trace identification
      };

      // Execute tracing based on which platforms are enabled
      if (
        isWeaveEnabled() &&
        hasWeaveData &&
        isLangfuseEnabled() &&
        hasLangfuseData
      ) {
        // Both platforms enabled - trace in parallel
        const weaveTracedCall = createTracedLLMCall(
          request => proxyService.makeRequest(request),
          openRouterRequest
        );

        // Execute Weave trace (this makes the actual API call)
        const llmResponse = await weaveTracedCall(llmInput);

        // Execute Langfuse trace asynchronously (doesn't block response)
        createTracedLangfuseLLMCall(
          async () => ({ status: 200, headers: {}, data: llmResponse }),
          openRouterRequest,
          llmInput
        )().catch(error => {
          Logger.error(
            'Langfuse tracing failed (non-blocking)',
            correlationId,
            {
              error: error instanceof Error ? error.message : String(error),
            }
          );
        });

        proxyResponse = {
          status: 200,
          headers: {},
          data: llmResponse,
        };

        Logger.info('Both Weave and Langfuse traces created', correlationId, {
          model: requestBody.model,
        });
      } else if (isWeaveEnabled() && hasWeaveData) {
        // Only Weave enabled
        const tracedCall = createTracedLLMCall(
          request => proxyService.makeRequest(request),
          openRouterRequest
        );

        const llmResponse = await tracedCall(llmInput);

        proxyResponse = {
          status: 200,
          headers: {},
          data: llmResponse,
        };

        Logger.info('Weave trace created for chat completion', correlationId, {
          model: requestBody.model,
        });
      } else if (isLangfuseEnabled() && hasLangfuseData) {
        // Only Langfuse enabled
        const tracedCall = createTracedLangfuseLLMCall(
          request => proxyService.makeRequest(request),
          openRouterRequest,
          llmInput
        );

        const llmResponse = await tracedCall();

        proxyResponse = {
          status: 200,
          headers: {},
          data: llmResponse,
        };

        Logger.info(
          'Langfuse trace created for chat completion',
          correlationId,
          {
            model: requestBody.model,
          }
        );
      } else {
        // Fallback to non-traced call
        proxyResponse = await proxyService.makeRequest(openRouterRequest);
      }
    } else {
      // Non-chat completion or tracing not enabled
      proxyResponse = await proxyService.makeRequest(openRouterRequest);
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
