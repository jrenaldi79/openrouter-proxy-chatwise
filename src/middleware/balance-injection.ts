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
import { envConfig } from '../config/environment';

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
      Logger.balanceDebug('SKIPPING: Not a ChatWise client', correlationId);
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
      Logger.balanceDebug('SKIPPING: Not a new session', correlationId);
      return next(); // Not a new session, continue normal processing
    }

    // Validate authorization for balance check
    const authToken = AuthToken.fromRequest(req);
    Logger.balanceAuth(!!authToken, authToken?.isValid || false, correlationId);

    if (!authToken || !authToken.isValid) {
      Logger.balanceDebug(
        'AUTH FAILED: Passing to main handler',
        correlationId
      );
      return next(); // Let the main handler deal with auth errors
    }

    // Only inject balance for streaming requests (for now)
    Logger.balanceStream(!!chatRequest.stream, correlationId);
    if (!chatRequest.stream) {
      Logger.balanceDebug(
        'NON-STREAMING: Skipping balance injection',
        correlationId
      );
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
    const balanceText =
      balance.totalCredits === -1
        ? `💰 Account: Unlimited credits (${balance.usedCredits} used)\n\n`
        : `💰 Balance: ${balance.totalCredits} credits remaining (${balance.usedCredits} used)\n\n`;

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

      const openRouterRequest = OpenRouterRequest.fromProxyRequest(
        {
          method: 'POST',
          path: openRouterPath,
          headers: req.headers as Record<string, string>,
          body: chatRequest,
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
        httpsAgent: new https.Agent({
          keepAlive: true,
          timeout: 60000,
          rejectUnauthorized: envConfig.NODE_TLS_REJECT_UNAUTHORIZED,
        }),
      };

      Logger.balanceDebug('Making axios request...', correlationId);
      const response = await axios(axiosConfig);
      Logger.balanceDebug('Axios response received', correlationId);

      if (response.status !== 200) {
        Logger.balanceError(
          'OpenRouter returned non-200 status',
          correlationId,
          undefined,
          { status: response.status }
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      Logger.balanceInfo(
        'Setting up streaming with balance injection',
        correlationId
      );

      let isFirstContentChunk = true;
      let chunkBuffer = '';

      // Parse and relay OpenRouter's SSE stream with balance injection
      response.data.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString();
        Logger.balanceEvent('Received chunk', correlationId, {
          chunkPreview: chunkStr.substring(0, 100),
        });
        chunkBuffer += chunkStr;

        // Process complete SSE events (lines ending with \n\n)
        const events = chunkBuffer.split('\n\n');
        // Keep the last incomplete event in buffer
        chunkBuffer = events.pop() || '';

        for (const event of events) {
          if (!event.trim()) continue;

          Logger.balanceEvent(
            `Checking event: ${event.substring(0, 200)}`,
            correlationId
          );

          let modifiedEvent = event;

          // Replace chat IDs to maintain consistency
          modifiedEvent = modifiedEvent.replace(
            /"id":"[^"]+"/g,
            `"id":"${chatId}"`
          );

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
                Logger.balanceInfo(
                  'Found content chunk - injecting balance',
                  correlationId
                );

                // Inject balance at the beginning of content
                jsonObj.choices[0].delta.content =
                  balanceText + jsonObj.choices[0].delta.content;

                // Reconstruct the SSE event
                modifiedEvent = `data: ${JSON.stringify(jsonObj)}`;
                isFirstContentChunk = false;
                Logger.balanceInfo(
                  'Balance injected into first chunk',
                  correlationId
                );
              } else {
                Logger.balanceEvent(
                  'Skipping event - no content or empty',
                  correlationId
                );
              }
            } catch (error) {
              Logger.balanceEvent(
                'Invalid JSON - skipping injection',
                correlationId
              );
            }
          }

          res.write(modifiedEvent + '\n\n');
          Logger.balanceEvent('Event relayed', correlationId);
        }
      });

      response.data.on('end', () => {
        Logger.balanceEvent('Stream ended', correlationId);
        res.end();
      });

      response.data.on('error', (error: Error) => {
        Logger.balanceError('Stream error', correlationId, error);
        res.write('data: [DONE]\n\n');
        res.end();
      });

      Logger.balanceDebug('All handlers set up', correlationId);
    } catch (streamError) {
      Logger.balanceError(
        'Streaming setup error',
        correlationId,
        streamError instanceof Error
          ? streamError
          : new Error(String(streamError))
      );
      res.write('data: [DONE]\n\n');
      res.end();
    }

    return;
  } catch (error) {
    Logger.balanceError(
      'Balance injection error',
      correlationId,
      error instanceof Error ? error : new Error(String(error))
    );
    // Continue with normal processing if balance injection fails
    return next();
  }
}
