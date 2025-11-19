/**
 * Unit tests for SSE Parser Utility
 *
 * RED PHASE - These tests should FAIL initially until implementation is correct
 */

import {
  parseSSEBuffer,
  accumulateStreamResponse,
  parseAndAccumulateSSE,
} from '../../src/utils/sse-parser';

describe('SSE Parser - parseSSEBuffer', () => {
  const correlationId = 'test-correlation-id';

  it('should parse single SSE chunk with content delta', () => {
    const sseBuffer =
      'data: {"id":"chat-123","model":"gpt-4","created":1234567890,"choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}\n\n';

    const chunks = parseSSEBuffer(sseBuffer, correlationId);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      id: 'chat-123',
      model: 'gpt-4',
      created: 1234567890,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: 'Hello',
          },
        },
      ],
    });
  });

  it('should parse multiple SSE chunks separated by double newlines', () => {
    const sseBuffer =
      'data: {"id":"chat-123","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"id":"chat-123","choices":[{"index":0,"delta":{"content":" world"}}]}\n\n' +
      'data: {"id":"chat-123","choices":[{"index":0,"delta":{"content":"!"}}]}\n\n';

    const chunks = parseSSEBuffer(sseBuffer, correlationId);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.choices?.[0]?.delta?.content).toBe('Hello');
    expect(chunks[1]?.choices?.[0]?.delta?.content).toBe(' world');
    expect(chunks[2]?.choices?.[0]?.delta?.content).toBe('!');
  });

  it('should skip [DONE] marker', () => {
    const sseBuffer =
      'data: {"id":"chat-123","choices":[{"index":0,"delta":{"content":"Done"}}]}\n\n' +
      'data: [DONE]\n\n';

    const chunks = parseSSEBuffer(sseBuffer, correlationId);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.choices?.[0]?.delta?.content).toBe('Done');
  });

  it('should handle empty buffer gracefully', () => {
    const chunks = parseSSEBuffer('', correlationId);
    expect(chunks).toHaveLength(0);
  });

  it('should skip malformed JSON chunks', () => {
    const sseBuffer =
      'data: {"id":"chat-123","choices":[{"index":0,"delta":{"content":"Valid"}}]}\n\n' +
      'data: {invalid json}\n\n' +
      'data: {"id":"chat-123","choices":[{"index":0,"delta":{"content":"Also valid"}}]}\n\n';

    const chunks = parseSSEBuffer(sseBuffer, correlationId);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.choices?.[0]?.delta?.content).toBe('Valid');
    expect(chunks[1]?.choices?.[0]?.delta?.content).toBe('Also valid');
  });

  it('should parse usage chunk (final chunk)', () => {
    const sseBuffer =
      'data: {"id":"chat-123","usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n';

    const chunks = parseSSEBuffer(sseBuffer, correlationId);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    });
  });
});

describe('SSE Parser - accumulateStreamResponse', () => {
  const correlationId = 'test-correlation-id';

  it('should accumulate content from multiple delta chunks', () => {
    const chunks = [
      {
        id: 'chat-123',
        model: 'gpt-4',
        created: 1234567890,
        choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' } }],
      },
      { id: 'chat-123', choices: [{ index: 0, delta: { content: ' world' } }] },
      { id: 'chat-123', choices: [{ index: 0, delta: { content: '!' } }] },
    ];

    const accumulated = accumulateStreamResponse(chunks, correlationId);

    expect(accumulated.id).toBe('chat-123');
    expect(accumulated.model).toBe('gpt-4');
    expect(accumulated.created).toBe(1234567890);
    expect(accumulated.role).toBe('assistant');
    expect(accumulated.content).toBe('Hello world!');
  });

  it('should extract finish_reason from final chunk', () => {
    const chunks = [
      { choices: [{ index: 0, delta: { content: 'Done' } }] },
      { choices: [{ index: 0, finish_reason: 'stop' }] },
    ];

    const accumulated = accumulateStreamResponse(chunks, correlationId);

    expect(accumulated.finishReason).toBe('stop');
  });

  it('should extract usage from final chunk', () => {
    const chunks = [
      { choices: [{ index: 0, delta: { content: 'Text' } }] },
      { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
    ];

    const accumulated = accumulateStreamResponse(chunks, correlationId);

    expect(accumulated.usage.promptTokens).toBe(10);
    expect(accumulated.usage.completionTokens).toBe(20);
    expect(accumulated.usage.totalTokens).toBe(30);
  });

  it('should handle empty chunks array', () => {
    const accumulated = accumulateStreamResponse([], correlationId);

    expect(accumulated.content).toBe('');
    expect(accumulated.role).toBe('assistant');
    expect(accumulated.id).toBeNull();
    expect(accumulated.model).toBeNull();
  });

  it('should default role to assistant if not specified', () => {
    const chunks = [
      { choices: [{ index: 0, delta: { content: 'No role specified' } }] },
    ];

    const accumulated = accumulateStreamResponse(chunks, correlationId);

    expect(accumulated.role).toBe('assistant');
  });

  it('should handle missing usage gracefully', () => {
    const chunks = [
      { choices: [{ index: 0, delta: { content: 'No usage data' } }] },
    ];

    const accumulated = accumulateStreamResponse(chunks, correlationId);

    expect(accumulated.usage.promptTokens).toBeNull();
    expect(accumulated.usage.completionTokens).toBeNull();
    expect(accumulated.usage.totalTokens).toBeNull();
  });
});

describe('SSE Parser - parseAndAccumulateSSE (integration)', () => {
  const correlationId = 'test-correlation-id';

  it('should parse and accumulate complete SSE stream', () => {
    const sseBuffer =
      'data: {"id":"chat-123","model":"gpt-4","created":1234567890,"choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}\n\n' +
      'data: {"id":"chat-123","choices":[{"index":0,"delta":{"content":" world"}}]}\n\n' +
      'data: {"id":"chat-123","choices":[{"index":0,"delta":{"content":"!"}}]}\n\n' +
      'data: {"id":"chat-123","choices":[{"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}\n\n' +
      'data: [DONE]\n\n';

    const result = parseAndAccumulateSSE(sseBuffer, correlationId);

    expect(result.id).toBe('chat-123');
    expect(result.model).toBe('gpt-4');
    expect(result.content).toBe('Hello world!');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.totalTokens).toBe(8);
  });

  it('should handle real OpenRouter SSE stream format', () => {
    // Simulate real OpenRouter format
    const sseBuffer =
      'data: {"id":"gen-1234","provider":"OpenAI","model":"gpt-4","created":1234567890,"choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n' +
      'data: {"id":"gen-1234","choices":[{"index":0,"delta":{"content":"Test"}}]}\n\n' +
      'data: {"id":"gen-1234","choices":[{"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":1,"total_tokens":11}}\n\n' +
      'data: [DONE]\n\n';

    const result = parseAndAccumulateSSE(sseBuffer, correlationId);

    expect(result.id).toBe('gen-1234');
    expect(result.model).toBe('gpt-4');
    expect(result.content).toBe('Test');
    expect(result.role).toBe('assistant');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(1);
    expect(result.usage.totalTokens).toBe(11);
  });
});
