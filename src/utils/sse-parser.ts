/**
 * Server-Sent Events (SSE) Parser for OpenRouter Streaming Responses
 *
 * Utilities for parsing and accumulating SSE format streaming responses
 * from OpenRouter API into structured data for tracing platforms.
 */

import { Logger } from './logger';

/**
 * Accumulated streaming response for tracing
 */
export interface AccumulatedStreamResponse {
  id: string | null;
  model: string | null;
  created: number | null;
  content: string;
  role: string;
  finishReason: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  error: string | null;
}

/**
 * SSE chunk parsed structure
 */
interface SSEChunk {
  id?: string;
  model?: string;
  created?: number;
  choices?: Array<{
    index: number;
    delta?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Parse SSE format buffer into structured chunks
 *
 * @param buffer - Accumulated SSE data buffer
 * @returns Array of parsed JSON chunks
 */
export function parseSSEBuffer(
  buffer: string,
  correlationId: string
): SSEChunk[] {
  const chunks: SSEChunk[] = [];

  // Split by double newline (SSE event separator)
  const events = buffer.split('\n\n');

  for (const event of events) {
    if (!event.trim()) continue;

    // Skip [DONE] marker
    if (event.includes('[DONE]')) continue;

    // Extract JSON from "data: {...}" format
    const dataMatch = event.match(/^data: (.+)$/m);
    if (!dataMatch || !dataMatch[1]) continue;

    try {
      const jsonStr = dataMatch[1];
      const chunk = JSON.parse(jsonStr) as SSEChunk;
      chunks.push(chunk);
    } catch (error) {
      Logger.error('Failed to parse SSE chunk JSON', correlationId, {
        error: error instanceof Error ? error.message : String(error),
        chunkPreview: event.substring(0, 200),
      });
    }
  }

  return chunks;
}

/**
 * Accumulate streaming deltas into a complete response
 *
 * @param chunks - Array of parsed SSE chunks
 * @param correlationId - Request correlation ID for logging
 * @returns Accumulated response data
 */
export function accumulateStreamResponse(
  chunks: SSEChunk[],
  correlationId: string
): AccumulatedStreamResponse {
  const accumulated: AccumulatedStreamResponse = {
    id: null,
    model: null,
    created: null,
    content: '',
    role: 'assistant',
    finishReason: null,
    usage: {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    },
    error: null,
  };

  for (const chunk of chunks) {
    // Extract metadata from first chunk
    if (chunk.id && !accumulated.id) {
      accumulated.id = chunk.id;
    }
    if (chunk.model && !accumulated.model) {
      accumulated.model = chunk.model;
    }
    if (chunk.created && !accumulated.created) {
      accumulated.created = chunk.created;
    }

    // Accumulate delta content
    if (chunk.choices && chunk.choices.length > 0 && chunk.choices[0]) {
      const choice = chunk.choices[0]!; // Non-null assertion: we checked above

      if (choice.delta?.role) {
        accumulated.role = choice.delta.role;
      }

      if (choice.delta?.content) {
        accumulated.content += choice.delta.content;
      }

      if (choice.finish_reason) {
        accumulated.finishReason = choice.finish_reason;
      }
    }

    // Extract usage from final chunk (usually only in last chunk)
    if (chunk.usage) {
      accumulated.usage.promptTokens = chunk.usage.prompt_tokens || null;
      accumulated.usage.completionTokens =
        chunk.usage.completion_tokens || null;
      accumulated.usage.totalTokens = chunk.usage.total_tokens || null;
    }
  }

  Logger.info('Accumulated streaming response', correlationId, {
    id: accumulated.id,
    model: accumulated.model,
    contentLength: accumulated.content.length,
    finishReason: accumulated.finishReason,
    hasUsage: accumulated.usage.totalTokens !== null,
  });

  return accumulated;
}

/**
 * Parse and accumulate SSE buffer in one step
 *
 * @param buffer - Raw SSE buffer string
 * @param correlationId - Request correlation ID
 * @returns Accumulated response data
 */
export function parseAndAccumulateSSE(
  buffer: string,
  correlationId: string
): AccumulatedStreamResponse {
  const chunks = parseSSEBuffer(buffer, correlationId);
  return accumulateStreamResponse(chunks, correlationId);
}
