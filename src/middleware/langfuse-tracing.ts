/**
 * Langfuse Observability Middleware for LLM Chat Completions
 *
 * Creates proper Langfuse traces for OpenRouter LLM API calls.
 * This middleware captures chat completion requests and responses,
 * logging them to Langfuse for observability.
 */

import { Request, Response, NextFunction } from 'express';
import { startActiveObservation } from '@langfuse/tracing';
import { isLangfuseEnabled, isApiKeyAllowed } from '../config/langfuse';
import { Logger } from '../utils/logger';
import { OpenRouterRequest } from '../models/OpenRouterRequest';
import { ProxyResponse } from '../services/ProxyService';

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

/**
 * Langfuse tracing middleware for chat completions
 * Stores request data for later trace creation
 */
export function langfuseTracingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if Langfuse is not enabled
  if (!isLangfuseEnabled()) {
    return next();
  }

  // Extract API key from Authorization header
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.replace(/^Bearer\s+/i, '');

  // Skip if API key is not in allowlist
  if (!isApiKeyAllowed(apiKey)) {
    return next();
  }

  const correlationId = req.correlationId || 'unknown';
  const requestBody: ChatCompletionRequest = req.body;

  // Store request data on request object for later use
  (req as Request & { __langfuseRequestData?: unknown }).__langfuseRequestData =
    {
      model: requestBody.model,
      messages: requestBody.messages,
      temperature: requestBody.temperature,
      max_tokens: requestBody.max_tokens,
      correlationId,
    };

  Logger.info('Langfuse tracing enabled for request', correlationId, {
    model: requestBody.model,
    messageCount: requestBody.messages?.length || 0,
  });

  next();
}

/**
 * LLM completion response structure for Langfuse
 */
interface LLMCompletionResponse {
  id: string;
  created: number;
  model: string;
  object: string;
  choices: Array<{
    finish_reason: string | null;
    index: number;
    message: {
      content: string;
      role: string;
      [key: string]: any;
    };
  }>;
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Create a traced LLM call using Langfuse
 * This factory function returns a function that creates Langfuse traces
 */
export function createTracedLangfuseLLMCall(
  proxyFn: (request: OpenRouterRequest) => Promise<ProxyResponse>,
  openRouterRequest: OpenRouterRequest,
  llmInput: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    n?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    correlationId?: string; // For trace identification in tests
  }
) {
  return async (): Promise<LLMCompletionResponse> => {
    // Create a trace with active observation for automatic context management
    return await startActiveObservation(
      'openrouter-chat-completion',
      async trace => {
        // Update trace with input for identification
        trace.update({
          input: {
            model: llmInput.model,
            messages: llmInput.messages,
            parameters: {
              temperature: llmInput.temperature,
              max_tokens: llmInput.max_tokens,
              top_p: llmInput.top_p,
              n: llmInput.n,
              presence_penalty: llmInput.presence_penalty,
              frequency_penalty: llmInput.frequency_penalty,
            },
          },
          metadata: {
            messageCount: llmInput.messages.length,
            hasSystemPrompt: llmInput.messages.some(m => m.role === 'system'),
            correlationId: llmInput.correlationId, // For test identification
          },
        });

        // Add correlation ID as tag for easier querying
        if (llmInput.correlationId) {
          (trace as any).setTags?.([llmInput.correlationId]);
        }

        // Create a nested generation observation for the LLM call
        const generation = trace.startObservation(
          'llm-generation',
          {
            input: llmInput.messages,
            modelParameters: {
              model: llmInput.model,
              temperature: llmInput.temperature || 1,
              max_tokens: llmInput.max_tokens || 0,
              top_p: llmInput.top_p || 1,
              n: llmInput.n || 1,
              presence_penalty: llmInput.presence_penalty || 0,
              frequency_penalty: llmInput.frequency_penalty || 0,
            },
          },
          { asType: 'generation' }
        );

        try {
          // Execute the actual proxy call
          const response = await proxyFn(openRouterRequest);
          const responseData = response.data as LLMCompletionResponse;

          // Update generation with output and usage
          generation.update({
            output: {
              id: responseData.id,
              model: responseData.model,
              choices: responseData.choices,
            },
            usageDetails: {
              input: responseData.usage?.prompt_tokens || 0,
              output: responseData.usage?.completion_tokens || 0,
              total: responseData.usage?.total_tokens || 0,
            },
            metadata: {
              finish_reason: responseData.choices[0]?.finish_reason,
              response_id: responseData.id,
            },
          });

          // Update trace with output
          trace.update({
            output: {
              content: responseData.choices[0]?.message?.content,
              finish_reason: responseData.choices[0]?.finish_reason,
              usage: responseData.usage,
            },
          });

          // End the generation
          generation.end();

          Logger.info(
            'Langfuse trace created for chat completion',
            (openRouterRequest as any).correlationId || 'unknown',
            {
              model: responseData.model,
              tokens: responseData.usage?.total_tokens,
            }
          );

          return responseData;
        } catch (error) {
          // Update generation with error
          generation.update({
            level: 'ERROR',
            statusMessage:
              error instanceof Error ? error.message : 'Unknown error',
          });
          generation.end();

          // Update trace with error
          trace.update({
            level: 'ERROR',
            output: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });

          Logger.error(
            'Error in Langfuse traced LLM call',
            (openRouterRequest as any).correlationId || 'unknown',
            {
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
            }
          );

          throw error;
        }
      }
    );
  };
}
