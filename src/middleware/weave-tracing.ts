/**
 * Weave Observability Middleware for LLM Chat Completions
 *
 * Creates proper Weave traces for OpenRouter LLM API calls.
 * This middleware captures chat completion requests and responses,
 * logging them to Weights & Biases Weave for observability.
 */

import { Request, Response, NextFunction } from 'express';
import { weave, isWeaveEnabled, isApiKeyAllowed } from '../config/weave';
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
  [key: string]: any;
}

/**
 * Weave tracing middleware for chat completions
 * Stores request data and sets up response capture
 */
export function weaveTracingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if Weave is not enabled
  if (!isWeaveEnabled()) {
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
  (req as any).__weaveRequestData = {
    model: requestBody.model,
    messages: requestBody.messages,
    temperature: requestBody.temperature,
    max_tokens: requestBody.max_tokens,
    correlationId,
  };

  Logger.info('Weave tracing enabled for request', correlationId, {
    model: requestBody.model,
    messageCount: requestBody.messages?.length || 0,
  });

  next();
}

/**
 * LLM completion response structure for Weave
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
 * Create a traced LLM proxy call with a closure to avoid capturing internal parameters
 * This factory function returns a weave.op wrapped function that accepts LLM parameters
 *
 * CRITICAL: The function must accept individual parameters, not an object, to avoid arg0 wrapping
 */
export function createTracedLLMCall(
  proxyFn: (request: OpenRouterRequest) => Promise<ProxyResponse>,
  openRouterRequest: OpenRouterRequest
) {
  // CRITICAL: Use parameterNames: 'useParam0Object' to tell Weave to use the first
  // parameter as the input object directly, avoiding arg0 wrapper.
  // This is the TypeScript SDK solution for expanding object properties at top level.
  async function openrouterChatCompletion(input: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    n?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    correlationId?: string; // For trace identification in tests
  }): Promise<LLMCompletionResponse> {
    // Execute the actual proxy call
    const response = await proxyFn(openRouterRequest);
    const responseData = response.data as LLMCompletionResponse;

    // Return the formatted response
    return responseData;
  }

  // Wrap with weave.op() using parameterNames: 'useParam0Object' option
  // This tells Weave to expand the first parameter's properties at the top level
  const tracedOp = weave.op(openrouterChatCompletion, {
    name: 'openrouter.chat.completions',
    parameterNames: 'useParam0Object',
  });

  return tracedOp;
}
