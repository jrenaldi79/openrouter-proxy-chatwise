/**
 * Balance injection middleware for ChatWise new chat sessions
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import https from 'https';
import { AuthToken } from '../models/AuthToken';
import { OpenRouterRequest } from '../models/OpenRouterRequest';
import { ChatCompletionRequest } from '../services/BalanceInjectionService';
import { Logger } from '../utils/logger';
import { balanceInjectionService } from '../config/services';
import { envConfig, isStreamDebugEnabled } from '../config/environment';
import { isWeaveEnabled } from '../config/weave';
import { isLangfuseEnabled } from '../config/langfuse';
import { parseAndAccumulateSSE } from '../utils/sse-parser';
import { traceStreamingCompletion } from '../utils/async-tracer';
import { injectAnthropicProvider } from '../utils/provider-routing';
import { withRetry, DEFAULT_RETRY_CONFIG } from '../utils/retry';

/**
 * Balance injection middleware for new chat sessions
 */
export async function balanceInjectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const correlationId = req.correlationId as string;

  // Track all requests to this middleware
  Logger.balanceMiddleware(
    `${req.method} ${req.path} - body:${!!req.body}`,
    correlationId
  );

  // Log headers to identify client patterns
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || '';
  const origin = req.headers['origin'] || '';
  Logger.balanceClient(false, userAgent, correlationId, { origin, referer });

  // Only process POST requests with valid bodies
  if (req.method !== 'POST' || !req.body) {
    Logger.balanceDebug(
      `SKIPPING: Not POST or no body - method:${req.method} body:${!!req.body}`,
      correlationId
    );
    return next();
  }

  try {
    // Parse the chat completion request
    const chatRequest = req.body as ChatCompletionRequest;
    Logger.balanceDebug(
      `PARSED REQUEST: messages:${chatRequest?.messages?.length || 0}`,
      correlationId
    );

    // Check if this request is from ChatWise client
    const isChatWise = balanceInjectionService.isChatWiseClient(req.headers);
    Logger.balanceClient(isChatWise, userAgent, correlationId);

    if (!isChatWise) {
      Logger.info('SKIPPING: Not a ChatWise client', correlationId);
      return next();
    }

    // Check if this is a new session (single user message)
    const isNewSession = balanceInjectionService.isNewSession(chatRequest);
    Logger.balanceSession(
      isNewSession,
      chatRequest?.messages?.length || 0,
      correlationId
    );

    if (!isNewSession) {
      Logger.info('SKIPPING: Not a new session', correlationId);
      return next(); // Not a new session, continue normal processing
    }

    // Validate authorization for balance check
    const authToken = AuthToken.fromRequest(req);
    Logger.balanceAuth(!!authToken, authToken?.isValid || false, correlationId);

    if (!authToken || !authToken.isValid) {
      Logger.info('AUTH FAILED: Passing to main handler', correlationId);
      return next(); // Let the main handler deal with auth errors
    }

    // Only inject balance for streaming requests (for now)
    Logger.balanceStream(!!chatRequest.stream, correlationId);
    if (!chatRequest.stream) {
      Logger.info('NON-STREAMING: Skipping balance injection', correlationId);
      return next(); // Skip non-streaming requests for this prototype
    }

    Logger.balanceInfo(
      'Starting balance injection for new session',
      correlationId
    );

    // Get user's balance
    Logger.balanceDebug('Fetching user balance...', correlationId);
    const balance = await balanceInjectionService.getUserBalance(
      authToken,
      correlationId
    );

    Logger.balanceDebug(
      `Balance fetch result: ${balance ? 'SUCCESS' : 'FAILED'}`,
      correlationId
    );

    if (!balance) {
      Logger.balanceError(
        'Balance fetch failed, continuing to main handler',
        correlationId
      );
      return next(); // Continue without balance if we can't fetch it
    }

    // Create balance text to prepend to first LLM response
    const usedDollars = balance.usedCredits.toFixed(2);
    const totalDollars = balance.totalCredits.toFixed(2);
    const balanceText =
      balance.totalCredits === -1
        ? `💰 Account: Unlimited credits ($${usedDollars} used)\n\n`
        : `💰 Balance: $${totalDollars} remaining ($${usedDollars} used)\n\n`;

    Logger.balanceInfo(
      'Setting up streaming with balance injection',
      correlationId
    );

    try {
      // Set up proper SSE streaming response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Correlation-Id': correlationId,
      });

      // Generate unique chat ID
      const chatId = balanceInjectionService.generateChatId();
      Logger.balanceDebug(`Generated chat ID: ${chatId}`, correlationId);

      // Create request for LLM chat completion immediately
      Logger.balanceDebug('Creating OpenRouter request...', correlationId);

      // Map ChatWise path to OpenRouter path
      const openRouterPath = req.originalUrl.startsWith('/v1/')
        ? `/api${req.originalUrl}`
        : req.originalUrl;

      Logger.balanceDebug(
        `Path mapping: ${req.originalUrl} -> ${openRouterPath}`,
        correlationId
      );

      // Inject Anthropic provider routing for Claude models to avoid Google Vertex truncation issues
      const modifiedChatRequest = injectAnthropicProvider(
        chatRequest,
        correlationId
      );

      const openRouterRequest = OpenRouterRequest.fromProxyRequest(
        {
          method: 'POST',
          path: openRouterPath,
          headers: req.headers as Record<string, string>,
          body: modifiedChatRequest,
          query: req.query as Record<string, string>,
        },
        envConfig.OPENROUTER_BASE_URL,
        envConfig.REQUEST_TIMEOUT_MS
      ).withCorrelationId(correlationId);
      Logger.balanceDebug('OpenRouter request created', correlationId);

      // Make streaming request to OpenRouter

      const axiosConfig = {
        method: openRouterRequest.method,
        url: openRouterRequest.url,
        headers: openRouterRequest.headers,
        data: openRouterRequest.body,
        timeout: openRouterRequest.timeout,
        responseType: 'stream' as const,
        validateStatus: (): boolean => true, // Don't throw on any status code
        httpsAgent: new https.Agent({
          keepAlive: true,
          timeout: 60000,
          rejectUnauthorized: envConfig.NODE_TLS_REJECT_UNAUTHORIZED,
        }),
      };

      Logger.balanceDebug('Making axios request...', correlationId);
      // Wrap axios call with retry logic for transient network errors
      const response = await withRetry(
        () => axios(axiosConfig),
        correlationId,
        DEFAULT_RETRY_CONFIG
      );
      Logger.balanceDebug('Axios response received', correlationId);

      if (response.status !== 200) {
        Logger.balanceError(
          'OpenRouter returned non-200 status - forwarding error to client',
          correlationId,
          undefined,
          { status: response.status }
        );

        // Forward the error response from OpenRouter to the client
        // OpenRouter typically returns JSON errors, but we need to handle the stream
        let errorData = '';
        response.data.on('data', (chunk: Buffer) => {
          errorData += chunk.toString();
        });

        response.data.on('end', () => {
          try {
            // Try to parse as JSON error
            const errorJson = JSON.parse(errorData);
            Logger.balanceError(
              'Forwarding OpenRouter error',
              correlationId,
              undefined,
              { error: errorJson }
            );

            // Send error in SSE format
            res.write(`data: ${JSON.stringify(errorJson)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch {
            // If not JSON, send as text
            Logger.balanceError(
              'Error response not JSON, sending as text',
              correlationId
            );
            res.write(
              `data: {"error": {"message": "${errorData.replace(/"/g, '\\"')}"}}\n\n`
            );
            res.write('data: [DONE]\n\n');
            res.end();
          }
        });

        response.data.on('error', (streamError: Error) => {
          Logger.balanceError(
            'Error reading error stream',
            correlationId,
            streamError
          );
          res.write(
            'data: {"error": {"message": "Failed to read error from upstream"}}\n\n'
          );
          res.write('data: [DONE]\n\n');
          res.end();
        });

        return;
      }

      Logger.balanceInfo(
        'Setting up streaming with balance injection',
        correlationId
      );

      let isFirstContentChunk = true;
      let chunkBuffer = '';

      // Check if tracing is enabled for this request
      const hasWeaveData = (req as Request & { __weaveRequestData?: unknown })
        .__weaveRequestData;
      const hasLangfuseData = (
        req as Request & { __langfuseRequestData?: unknown }
      ).__langfuseRequestData;
      const needsTracing =
        (isWeaveEnabled() && hasWeaveData) ||
        (isLangfuseEnabled() && hasLangfuseData);

      // Buffer for tracing (separate from chunkBuffer for SSE parsing)
      let tracingBuffer = needsTracing ? '' : null;

      // Parse and relay OpenRouter's SSE stream with balance injection
      response.data.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString();
        Logger.balanceEvent('Received chunk', correlationId, {
          chunkPreview: chunkStr.substring(0, 100),
        });
        chunkBuffer += chunkStr;

        // Buffer for tracing if needed
        if (tracingBuffer !== null) {
          tracingBuffer += chunkStr;
        }

        // Process complete SSE events (lines ending with \n\n)
        const events = chunkBuffer.split('\n\n');
        // Keep the last incomplete event in buffer
        chunkBuffer = events.pop() || '';

        for (const event of events) {
          if (!event.trim()) continue;

          let modifiedEvent = event;

          // Replace chat IDs to maintain consistency
          modifiedEvent = modifiedEvent.replace(
            /"id":"[^"]+"/g,
            `"id":"${chatId}"`
          );

          // DEBUG: Log detailed stream data for comparison (disabled in production)
          if (isStreamDebugEnabled() && event.startsWith('data: {')) {
            try {
              const debugJson = JSON.parse(event.substring(6));
              const delta = debugJson.choices?.[0]?.delta || {};
              const deltaKeys = Object.keys(delta);
              const finishReason = debugJson.choices?.[0]?.finish_reason;
              Logger.info('[STREAM_DEBUG] FROM_OPENROUTER', correlationId, {
                deltaKeys, // Show all keys present in delta
                hasContent: !!delta.content,
                contentPreview: delta.content?.substring(0, 100),
                hasThinking: !!delta.thinking,
                thinkingPreview: delta.thinking?.substring(0, 100),
                hasThinkingDelta: !!delta.thinking_delta,
                thinkingDeltaPreview: delta.thinking_delta?.substring(0, 100),
                // Check for reasoning field (some providers use this)
                hasReasoning: !!(delta as Record<string, unknown>).reasoning,
                reasoningPreview: (
                  (delta as Record<string, unknown>).reasoning as string
                )?.substring(0, 100),
                finishReason,
                role: delta.role,
              });
            } catch {
              // Ignore parse errors for debug logging
            }
          }

          // Inject balance into the first content chunk
          if (isFirstContentChunk && event.startsWith('data: {')) {
            try {
              // Extract JSON from SSE event
              const jsonStr = event.substring(6); // Remove "data: "
              const jsonObj = JSON.parse(jsonStr);

              if (
                jsonObj.choices &&
                jsonObj.choices[0] &&
                jsonObj.choices[0].delta &&
                jsonObj.choices[0].delta.content &&
                jsonObj.choices[0].delta.content.trim()
              ) {
                Logger.info(
                  'Found content chunk - injecting balance',
                  correlationId
                );

                // Inject balance at the beginning of content
                jsonObj.choices[0].delta.content =
                  balanceText + jsonObj.choices[0].delta.content;

                // Reconstruct the SSE event
                modifiedEvent = `data: ${JSON.stringify(jsonObj)}`;
                isFirstContentChunk = false;
                Logger.info('Balance injected into first chunk', correlationId);
              }
            } catch (error) {
              Logger.error('Invalid JSON - skipping injection', correlationId, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // DEBUG: Log what we're sending to client (disabled in production)
          if (isStreamDebugEnabled() && modifiedEvent.startsWith('data: {')) {
            try {
              const debugJson = JSON.parse(modifiedEvent.substring(6));
              const delta = debugJson.choices?.[0]?.delta || {};
              Logger.info('[STREAM_DEBUG] TO_CLIENT', correlationId, {
                hasContent: !!delta.content,
                contentPreview: delta.content?.substring(0, 100),
                hasThinking: !!delta.thinking,
                hasThinkingDelta: !!delta.thinking_delta,
              });
            } catch {
              // Ignore parse errors for debug logging
            }
          }

          res.write(modifiedEvent + '\n\n');
        }
      });

      response.data.on('end', () => {
        Logger.info('Stream ended', correlationId);
        res.end();

        // Async tracing after stream completes (non-blocking)
        if (tracingBuffer !== null && needsTracing) {
          Logger.info('Stream completed, starting async trace', correlationId);

          // Fire-and-forget async tracing
          void (async (): Promise<void> => {
            try {
              const accumulatedResponse = parseAndAccumulateSSE(
                tracingBuffer!,
                correlationId
              );

              const tracingInput = {
                model: chatRequest.model || 'unknown',
                messages: chatRequest.messages || [],
                temperature: chatRequest.temperature,
                max_tokens: chatRequest.max_tokens,
                top_p: chatRequest.top_p as number | undefined,
                n: chatRequest.n as number | undefined,
                presence_penalty: chatRequest.presence_penalty as
                  | number
                  | undefined,
                frequency_penalty: chatRequest.frequency_penalty as
                  | number
                  | undefined,
              };

              await traceStreamingCompletion(
                tracingInput,
                accumulatedResponse,
                correlationId,
                !!hasWeaveData,
                !!hasLangfuseData
              );
            } catch (error) {
              Logger.error(
                'Async streaming trace failed (balance injection)',
                correlationId,
                {
                  error: error instanceof Error ? error.message : String(error),
                }
              );
            }
          })();
        }
      });

      response.data.on('error', (error: Error) => {
        Logger.error('Stream error', correlationId, {
          error: error.message || String(error),
        });
        res.write('data: [DONE]\n\n');
        res.end();
      });

      Logger.info('All handlers set up', correlationId);
    } catch (streamError) {
      Logger.error(
        'Streaming setup error',
        correlationId,
        streamError instanceof Error
          ? { error: streamError.message }
          : { error: String(streamError) }
      );
      res.write('data: [DONE]\n\n');
      res.end();
    }

    return;
  } catch (error) {
    Logger.error(
      'Balance injection error',
      correlationId,
      error instanceof Error
        ? { error: error.message }
        : { error: String(error) }
    );
    // Continue with normal processing if balance injection fails
    return next();
  }
}
