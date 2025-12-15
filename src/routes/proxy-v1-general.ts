/**
 * Proxy routes for general /v1/* endpoints
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import https from 'https';
import { proxyService } from '../config/services';
import { envConfig, isStreamDebugEnabled } from '../config/environment';
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
import { injectAnthropicProvider } from '../utils/provider-routing';
import { withRetry, DEFAULT_RETRY_CONFIG } from '../utils/retry';
import { getModelLimits, getWarningLevel } from '../config/model-limits';
import {
  generateContextWarning,
  createWarningSSEChunk,
} from '../utils/context-warning';

/**
 * Problematic headers that should be filtered out for upstream requests
 * These can cause SSL/TLS issues or are hop-by-hop headers
 */
const PROBLEMATIC_HEADERS = new Set([
  'host',
  'connection',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'content-length',
  // HTTP/2 specific headers that shouldn't be in HTTP/1.1
  ':authority',
  ':method',
  ':path',
  ':scheme',
  // Express/Node.js specific headers
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-real-ip',
  // Cache control headers that might interfere
  'if-modified-since',
  'if-none-match',
  'if-range',
  'if-unmodified-since',
  'range',
]);

/**
 * Filter headers for upstream requests, removing problematic ones
 */
function filterHeadersForUpstream(
  headers: Record<string, string | string[] | undefined>,
  targetHost: string
): Record<string, string | string[] | undefined> {
  const filtered: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!PROBLEMATIC_HEADERS.has(key.toLowerCase()) && value !== undefined) {
      filtered[key] = value;
    }
  }

  // Set the correct host for the target
  filtered['host'] = targetHost;

  return filtered;
}

/**
 * Handle streaming requests using axios (same approach as balance injection which works)
 */
async function handleStreamingRequest(
  req: Request,
  res: Response,
  correlationId: string
): Promise<void> {
  const targetUrl = `${envConfig.OPENROUTER_BASE_URL}/api/v1${req.path}`;
  const targetHost = new URL(envConfig.OPENROUTER_BASE_URL).host;

  // Filter out problematic headers (same filtering as non-streaming requests)
  const proxyHeaders = filterHeadersForUpstream(req.headers, targetHost);

  // Inject Anthropic provider routing for Claude models to avoid Google Vertex truncation issues
  const modifiedBody = req.body
    ? injectAnthropicProvider(req.body, correlationId)
    : req.body;

  // Pre-calculate body size for logging
  const bodyString = modifiedBody ? JSON.stringify(modifiedBody) : '';
  const bodySize = Buffer.byteLength(bodyString, 'utf8');

  Logger.info('Streaming request initiated', correlationId, {
    targetUrl,
    method: req.method,
    hasBody: !!req.body,
    bodySize,
  });

  // Get tracing flags from request (set by middleware)
  const hasWeaveData = (req as any).hasWeaveData || false;
  const hasLangfuseData = (req as any).hasLangfuseData || false;
  const shouldTrace = hasWeaveData || hasLangfuseData;

  // DEBUG: Log tracing flags
  Logger.info('Tracing flags check', correlationId, {
    hasWeaveData,
    hasLangfuseData,
    shouldTrace,
  });

  // Stream accumulation for tracing AND context warnings (always accumulate)
  let streamBuffer = '';

  // Track stream statistics for debugging
  let chunkCount = 0;
  let totalBytes = 0;
  let lastFinishReason: string | null = null;
  let lastChunkPreview = '';

  try {
    // Use axios with streaming - same approach as balance injection which works
    const axiosConfig = {
      method: req.method as 'POST' | 'GET',
      url: targetUrl,
      headers: proxyHeaders as Record<string, string>,
      data: modifiedBody,
      timeout: 300000, // 5 minutes for long-running streaming requests
      responseType: 'stream' as const,
      validateStatus: (): boolean => true, // Don't throw on any status code
      httpsAgent: new https.Agent({
        keepAlive: true,
        timeout: 300000,
        rejectUnauthorized: envConfig.NODE_TLS_REJECT_UNAUTHORIZED,
      }),
    };

    // Wrap axios call with retry logic for transient network errors
    // This only retries connection failures - once streaming starts, we can't retry
    const response = await withRetry(
      () => axios(axiosConfig),
      correlationId,
      DEFAULT_RETRY_CONFIG
    );

    Logger.info('Upstream response received', correlationId, {
      statusCode: response.status,
      headers: Object.keys(response.headers),
    });

    // Forward status and headers
    res.status(response.status);

    // Forward headers but clean them up
    const responseHeaders = { ...response.headers };
    delete responseHeaders['transfer-encoding'];
    res.set(responseHeaders);

    // Handle streaming data
    response.data.on('data', (chunk: Buffer) => {
      chunkCount++;
      totalBytes += chunk.length;

      const chunkStr = chunk.toString();

      // Capture finish_reason from SSE events for debugging
      try {
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            const jsonStr = line.substring(6);
            if (jsonStr.trim()) {
              const parsed = JSON.parse(jsonStr);
              if (parsed.choices?.[0]?.finish_reason) {
                lastFinishReason = parsed.choices[0].finish_reason;
              }
              // Capture last chunk preview for debugging
              lastChunkPreview = jsonStr.substring(0, 200);

              // DEBUG: Log detailed stream data for comparison (disabled in production)
              if (isStreamDebugEnabled()) {
                const delta = parsed.choices?.[0]?.delta || {};
                const deltaKeys = Object.keys(delta);
                Logger.info('[STREAM_DEBUG] FROM_OPENROUTER', correlationId, {
                  deltaKeys, // Show all keys present in delta
                  hasContent: !!delta.content,
                  contentPreview: delta.content?.substring(0, 100),
                  hasThinking: !!delta.thinking,
                  thinkingPreview: delta.thinking?.substring(0, 100),
                  hasThinkingDelta: !!delta.thinking_delta,
                  thinkingDeltaPreview: delta.thinking_delta?.substring(0, 100),
                  // Check for reasoning field (some providers use this)
                  hasReasoning: !!(delta as any).reasoning,
                  reasoningPreview: (delta as any).reasoning?.substring(0, 100),
                  finishReason: parsed.choices?.[0]?.finish_reason,
                  role: delta.role,
                  chunkNum: chunkCount,
                });
              }
            }
          }
        }
      } catch {
        // Ignore parse errors - chunks may be partial
      }

      // ALWAYS accumulate stream buffer for context warnings and tracing
      // (Context warnings need token usage data from the stream)
      streamBuffer += chunkStr;

      // DEBUG: Log that we're forwarding to client (disabled in production)
      if (isStreamDebugEnabled()) {
        Logger.info('[STREAM_DEBUG] TO_CLIENT', correlationId, {
          chunkNum: chunkCount,
          chunkSize: chunk.length,
        });
      }

      // Forward to client immediately (real-time streaming)
      res.write(chunk);
    });

    // Handle upstream errors
    response.data.on('error', (error: Error) => {
      Logger.error('Upstream stream error', correlationId, {
        error: error.message,
        chunkCount,
        totalBytes,
      });
      // End the response to prevent client from hanging
      if (!res.writableEnded) {
        res.end();
      }
    });

    // Handle upstream close (may indicate premature termination)
    response.data.on('close', () => {
      Logger.info('Upstream stream closed', correlationId, {
        chunkCount,
        totalBytes,
        streamBufferLength: streamBuffer.length,
      });
      // NOTE: Do NOT call res.end() here - let the 'end' handler do it
      // so that context warnings can be injected before the response ends
    });

    response.data.on('end', async () => {
      Logger.info('Upstream stream ended normally', correlationId, {
        chunkCount,
        totalBytes,
        finishReason: lastFinishReason,
        lastChunkPreview: lastChunkPreview.substring(0, 100),
      });

      // Check if context warning is needed
      if (streamBuffer && req.body?.model) {
        try {
          const { parseAndAccumulateSSE } = await import('../utils/sse-parser');
          const accumulated = parseAndAccumulateSSE(streamBuffer, correlationId);

          if (accumulated.usage.promptTokens) {
            const limits = getModelLimits(req.body.model);
            const warningLevel = getWarningLevel(
              accumulated.usage.promptTokens,
              limits
            );

            // DEBUG: Log context warning check details
            Logger.info('Context warning check', correlationId, {
              model: req.body.model,
              promptTokens: accumulated.usage.promptTokens,
              maxTokens: limits.maxContextTokens,
              warningLevel,
              percentage: Math.round((accumulated.usage.promptTokens / limits.maxContextTokens) * 100),
            });

            if (warningLevel !== 'none') {
              const warningText = generateContextWarning(
                warningLevel,
                accumulated.usage.promptTokens,
                limits.maxContextTokens
              );

              // DEBUG: Log injection attempt
              Logger.info('Attempting context warning injection', correlationId, {
                hasWarningText: !!warningText,
                resWritableEnded: res.writableEnded,
                warningLevel,
              });

              if (warningText && !res.writableEnded) {
                const warningChunk = createWarningSSEChunk(warningText);
                res.write(warningChunk);
                Logger.info('Context warning injected', correlationId, {
                  level: warningLevel,
                  promptTokens: accumulated.usage.promptTokens,
                  maxTokens: limits.maxContextTokens,
                });
              }
            }
          }
        } catch (error) {
          Logger.error('Failed to inject context warning', correlationId, {
            error: error instanceof Error ? error.message : String(error),
          });
          // Don't fail the request if warning injection fails
        }
      }

      res.end();

      // Create traces if needed
      if (shouldTrace && streamBuffer) {
        try {
          const { parseAndAccumulateSSE } = await import('../utils/sse-parser');
          const { traceStreamingCompletion } = await import(
            '../utils/async-tracer'
          );

          Logger.info('Stream completed, starting async trace', correlationId);

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

    // Handle client disconnect (e.g., user cancels request)
    req.on('close', () => {
      Logger.info('Client connection closed', correlationId, {
        chunkCount,
        totalBytes,
        aborted: req.destroyed,
      });
      // Destroy the response stream if client disconnected
      if (response.data && !response.data.destroyed) {
        response.data.destroy();
      }
    });

    // Handle response errors (client-side issues)
    res.on('error', (error: Error) => {
      Logger.error('Response stream error', correlationId, {
        error: error.message,
        chunkCount,
        totalBytes,
      });
    });
  } catch (error) {
    Logger.error('Streaming proxy request error', correlationId, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      chunkCount,
      totalBytes,
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
  }
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
      // For streaming requests, use axios-based streaming (same as balance injection)
      await handleStreamingRequest(req, res, correlationId);
      return;
    }

    // For non-streaming requests, use the existing ProxyService
    const fullPath = `/api/v1${req.path}`;

    // Inject Anthropic provider routing for Claude models to avoid Google Vertex truncation issues
    if (req.body) {
      req.body = injectAnthropicProvider(req.body, correlationId);
    }

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
