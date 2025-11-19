/**
 * Async Tracing Utility for Streaming Responses
 *
 * Non-blocking tracing of streaming chat completions to Weave and Langfuse
 * after the stream has completed and been sent to the client.
 */

import { Logger } from './logger';
import { isWeaveEnabled } from '../config/weave';
import { isLangfuseEnabled } from '../config/langfuse';
import { createTracedLLMCall } from '../middleware/weave-tracing';
import { createTracedLangfuseLLMCall } from '../middleware/langfuse-tracing';
import { AccumulatedStreamResponse } from './sse-parser';
import { OpenRouterRequest } from '../models/OpenRouterRequest';

/**
 * Input data for tracing
 */
export interface TracingInput {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  n?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

/**
 * Asynchronously trace streaming completion to observability platforms
 *
 * This function is fire-and-forget - it logs the trace but doesn't block
 * or throw errors to the calling code.
 *
 * @param input - LLM input parameters from request
 * @param response - Accumulated streaming response
 * @param correlationId - Request correlation ID
 * @param hasWeaveData - Whether Weave tracing was enabled for this request
 * @param hasLangfuseData - Whether Langfuse tracing was enabled for this request
 */
export async function traceStreamingCompletion(
  input: TracingInput,
  response: AccumulatedStreamResponse,
  correlationId: string,
  hasWeaveData: boolean,
  hasLangfuseData: boolean
): Promise<void> {
  try {
    // Create mock OpenRouterRequest for tracing functions
    // (they expect this structure but we don't actually make a request)
    const mockRequest = {
      correlationId,
    } as unknown as OpenRouterRequest;

    // Create mock response in OpenRouter format
    const mockProxyResponse = {
      status: 200,
      headers: {},
      data: {
        id: response.id || 'stream-' + Date.now(),
        created: response.created || Math.floor(Date.now() / 1000),
        model: response.model || input.model,
        object: 'chat.completion',
        choices: [
          {
            finish_reason: response.finishReason || 'stop',
            index: 0,
            message: {
              content: response.content,
              role: response.role,
            },
          },
        ],
        usage: {
          prompt_tokens: response.usage.promptTokens || 0,
          completion_tokens: response.usage.completionTokens || 0,
          total_tokens: response.usage.totalTokens || 0,
        },
      },
    };

    // Prepare LLM input for tracing
    const llmInput = {
      model: input.model,
      messages: input.messages,
      temperature: input.temperature ?? 1,
      max_tokens: input.max_tokens,
      top_p: input.top_p ?? 1,
      n: input.n ?? 1,
      presence_penalty: input.presence_penalty ?? 0,
      frequency_penalty: input.frequency_penalty ?? 0,
      correlationId, // For trace identification
    };

    // Trace to Weave if enabled
    if (isWeaveEnabled() && hasWeaveData) {
      try {
        const weaveTracedCall = createTracedLLMCall(
          async () => mockProxyResponse,
          mockRequest
        );

        await weaveTracedCall(llmInput);

        Logger.info(
          'Weave trace created for streaming completion',
          correlationId,
          {
            model: input.model,
            contentLength: response.content.length,
          }
        );
      } catch (weaveError) {
        Logger.error(
          'Weave streaming trace failed (non-blocking)',
          correlationId,
          {
            error:
              weaveError instanceof Error
                ? weaveError.message
                : String(weaveError),
          }
        );
      }
    }

    // Trace to Langfuse if enabled
    if (isLangfuseEnabled() && hasLangfuseData) {
      try {
        const langfuseTracedCall = createTracedLangfuseLLMCall(
          async () => mockProxyResponse,
          mockRequest,
          llmInput
        );

        await langfuseTracedCall();

        Logger.info(
          'Langfuse trace created for streaming completion',
          correlationId,
          {
            model: input.model,
            contentLength: response.content.length,
          }
        );
      } catch (langfuseError) {
        Logger.error(
          'Langfuse streaming trace failed (non-blocking)',
          correlationId,
          {
            error:
              langfuseError instanceof Error
                ? langfuseError.message
                : String(langfuseError),
          }
        );
      }
    }

    // Log if both platforms traced successfully
    if (
      isWeaveEnabled() &&
      hasWeaveData &&
      isLangfuseEnabled() &&
      hasLangfuseData
    ) {
      Logger.info(
        'Both Weave and Langfuse streaming traces created',
        correlationId,
        {
          model: input.model,
        }
      );
    }
  } catch (error) {
    // Catch-all error handler - don't let tracing errors propagate
    Logger.error('Async streaming trace failed', correlationId, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
