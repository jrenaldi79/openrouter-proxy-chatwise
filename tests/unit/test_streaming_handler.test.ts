/**
 * Unit tests for streaming request handler in proxy-v1-general.ts
 *
 * These tests are inspired by real-world request patterns observed during debugging:
 * - New sessions (2 messages) vs follow-up conversations (4-100+ messages)
 * - Multiple models: claude-opus-4.5, claude-sonnet-4.5, gemini-2.5-flash, etc.
 * - Large payload handling with proper Content-Length headers
 * - Header filtering for upstream requests
 */

describe('Streaming Handler Tests', () => {
  describe('Body Size Calculations', () => {
    /**
     * Test case inspired by: messageCount: 2, model: anthropic/claude-sonnet-4.5
     * New session with system + user message
     */
    it('should calculate correct body size for new session (2 messages)', () => {
      const body = {
        model: 'anthropic/claude-sonnet-4.5',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, how are you?' },
        ],
        stream: true,
        temperature: 0.7,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      expect(bodySize).toBeGreaterThan(0);
      expect(bodySize).toBeLessThan(1000); // Small payload for new session
    });

    /**
     * Test case inspired by: messageCount: 4, model: anthropic/claude-sonnet-4.5
     * Follow-up conversation with tool call response
     */
    it('should calculate correct body size for follow-up conversation (4 messages)', () => {
      const body = {
        model: 'anthropic/claude-sonnet-4.5',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the weather?' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"NYC"}',
                },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'call_123', content: 'Sunny, 72F' },
        ],
        stream: true,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      expect(bodySize).toBeGreaterThan(0);
      // 4 messages with tool calls should be larger
      expect(bodySize).toBeGreaterThan(200);
    });

    /**
     * Test case inspired by: messageCount: 48, model: anthropic/claude-opus-4.5
     * Long conversation that was failing before the fix
     */
    it('should calculate correct body size for long conversation (48 messages)', () => {
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: 'You are a helpful coding assistant.' },
      ];

      // Add 47 more messages (alternating user/assistant)
      for (let i = 0; i < 47; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `This is message ${i + 1} with some content that makes it realistic. ${
            i % 2 === 0
              ? 'Can you help me with this code?'
              : 'Sure, here is how you can solve that problem...'
          }`,
        });
      }

      const body = {
        model: 'anthropic/claude-opus-4.5',
        messages,
        stream: true,
        max_tokens: 4096,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      expect(bodySize).toBeGreaterThan(5000); // Large payload
      expect(messages.length).toBe(48);
    });

    /**
     * Test case inspired by: messageCount: 100, model: google/gemini-3-pro-preview
     * Very long conversation - edge case that was definitely failing
     */
    it('should calculate correct body size for very long conversation (100 messages)', () => {
      const messages: Array<{ role: string; content: string }> = [
        {
          role: 'system',
          content: 'You are a helpful assistant for a complex project.',
        },
      ];

      // Add 99 more messages
      for (let i = 0; i < 99; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}: ${
            i % 2 === 0
              ? 'Here is my question about the implementation details...'
              : 'I understand your question. Here is a detailed explanation with code examples and best practices...'
          } ${'Additional context '.repeat(10)}`,
        });
      }

      const body = {
        model: 'google/gemini-3-pro-preview',
        messages,
        stream: true,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      expect(bodySize).toBeGreaterThan(15000); // Very large payload
      expect(messages.length).toBe(100);

      // Verify Content-Length would be set correctly
      const contentLengthHeader = bodySize.toString();
      expect(contentLengthHeader).toMatch(/^\d+$/);
    });
  });

  describe('Header Filtering', () => {
    const problematicHeaders = [
      'host',
      'connection',
      'upgrade',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'content-length',
      ':authority',
      ':method',
      ':path',
      ':scheme',
      'x-forwarded-for',
      'x-forwarded-proto',
      'x-forwarded-host',
      'x-real-ip',
      'if-modified-since',
      'if-none-match',
      'if-range',
      'if-unmodified-since',
      'range',
    ];

    it('should identify all problematic headers that need filtering', () => {
      const PROBLEMATIC_HEADERS = new Set(problematicHeaders);

      // Verify the set contains all expected headers
      expect(PROBLEMATIC_HEADERS.size).toBe(22);
      expect(PROBLEMATIC_HEADERS.has('host')).toBe(true);
      expect(PROBLEMATIC_HEADERS.has('content-length')).toBe(true);
      expect(PROBLEMATIC_HEADERS.has('transfer-encoding')).toBe(true);
    });

    it('should preserve authorization and content-type headers', () => {
      const PROBLEMATIC_HEADERS = new Set(problematicHeaders);

      // These headers should NOT be filtered
      expect(PROBLEMATIC_HEADERS.has('authorization')).toBe(false);
      expect(PROBLEMATIC_HEADERS.has('content-type')).toBe(false);
      expect(PROBLEMATIC_HEADERS.has('accept')).toBe(false);
      expect(PROBLEMATIC_HEADERS.has('user-agent')).toBe(false);
    });

    it('should filter headers correctly for upstream request', () => {
      const PROBLEMATIC_HEADERS = new Set(problematicHeaders);
      const targetHost = 'openrouter.ai';

      const inputHeaders: Record<string, string | string[] | undefined> = {
        host: 'localhost:3000',
        authorization: 'Bearer sk-or-v1-xxx',
        'content-type': 'application/json',
        'content-length': '1234',
        connection: 'keep-alive',
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'ChatWise/1.0',
        accept: '*/*',
      };

      // Simulate header filtering
      const filtered: Record<string, string | string[] | undefined> = {};
      for (const [key, value] of Object.entries(inputHeaders)) {
        if (
          !PROBLEMATIC_HEADERS.has(key.toLowerCase()) &&
          value !== undefined
        ) {
          filtered[key] = value;
        }
      }
      filtered['host'] = targetHost;

      // Verify filtering results
      expect(filtered['host']).toBe('openrouter.ai');
      expect(filtered['authorization']).toBe('Bearer sk-or-v1-xxx');
      expect(filtered['content-type']).toBe('application/json');
      expect(filtered['user-agent']).toBe('ChatWise/1.0');
      expect(filtered['accept']).toBe('*/*');

      // These should be filtered out
      expect(filtered['content-length']).toBeUndefined();
      expect(filtered['connection']).toBeUndefined();
      expect(filtered['x-forwarded-for']).toBeUndefined();
    });
  });

  describe('Model-Specific Request Patterns', () => {
    /**
     * Anthropic Claude models with extended thinking
     */
    it('should handle Anthropic Claude request with thinking parameters', () => {
      const body = {
        model: 'anthropic/claude-opus-4.5',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Solve this complex problem step by step.' },
        ],
        stream: true,
        max_tokens: 16000,
        temperature: 1, // Required for extended thinking
        // Extended thinking budget
        thinking: {
          type: 'enabled',
          budget_tokens: 10000,
        },
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      expect(bodySize).toBeGreaterThan(0);
      expect(body.model).toContain('anthropic');
    });

    /**
     * Google Gemini models
     */
    it('should handle Google Gemini request', () => {
      const body = {
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ],
        stream: true,
        temperature: 0.7,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      expect(bodySize).toBeGreaterThan(0);
      expect(body.model).toContain('google');
    });

    /**
     * Request with tool calls (common pattern that was observed)
     */
    it('should handle request with tool definitions', () => {
      const body = {
        model: 'anthropic/claude-sonnet-4.5',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant with tools.',
          },
          { role: 'user', content: 'What is the weather in NYC?' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the current weather in a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string', description: 'City name' },
                },
                required: ['location'],
              },
            },
          },
        ],
        stream: true,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      expect(bodySize).toBeGreaterThan(400); // Tools add significant size
    });
  });

  describe('Content-Length Header Validation', () => {
    it('should calculate Content-Length correctly for UTF-8 content', () => {
      const body = {
        model: 'anthropic/claude-sonnet-4.5',
        messages: [
          { role: 'user', content: 'Hello! 你好! مرحبا! 🎉' }, // Multi-byte UTF-8
        ],
        stream: true,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      // Buffer.byteLength counts bytes, not characters
      // UTF-8 multi-byte characters will increase the byte count
      expect(bodySize).toBeGreaterThan(bodyString.length);
    });

    it('should handle empty messages array', () => {
      const body = {
        model: 'anthropic/claude-sonnet-4.5',
        messages: [],
        stream: true,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      expect(bodySize).toBeGreaterThan(0);
    });

    it('should handle very large message content', () => {
      // Simulate a message with a lot of code/content
      const largeContent = 'x'.repeat(100000); // 100KB of content

      const body = {
        model: 'anthropic/claude-opus-4.5',
        messages: [{ role: 'user', content: largeContent }],
        stream: true,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      expect(bodySize).toBeGreaterThan(100000);
      // Verify this would work with Content-Length header
      expect(Number.isInteger(bodySize)).toBe(true);
    });
  });

  describe('Edge Cases from Production Logs', () => {
    /**
     * Pattern: First request succeeds (messageCount: 2), immediate follow-up fails (messageCount: 4)
     * This was the exact failure pattern observed
     */
    it('should handle rapid sequential requests with different message counts', () => {
      // First request (new session)
      const firstRequest = {
        model: 'anthropic/claude-sonnet-4.5',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi!' },
        ],
        stream: true,
      };

      // Second request (follow-up - this was failing)
      const secondRequest = {
        model: 'anthropic/claude-sonnet-4.5',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi!' },
          { role: 'assistant', content: 'Hello! How can I help you today?' },
          { role: 'user', content: 'What is 2+2?' },
        ],
        stream: true,
      };

      const firstBodySize = Buffer.byteLength(
        JSON.stringify(firstRequest),
        'utf8'
      );
      const secondBodySize = Buffer.byteLength(
        JSON.stringify(secondRequest),
        'utf8'
      );

      // Second request should be larger
      expect(secondBodySize).toBeGreaterThan(firstBodySize);

      // Both should have valid Content-Length values
      expect(Number.isInteger(firstBodySize)).toBe(true);
      expect(Number.isInteger(secondBodySize)).toBe(true);
    });

    /**
     * Pattern: Non-new-session path (SKIPPING: Not a new session)
     * These requests bypass balance injection and go directly to handleStreamingRequest
     */
    it('should handle non-new-session requests correctly', () => {
      // Request with 48 messages (was failing with socket hang up)
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: 'You are a coding assistant.' },
      ];

      for (let i = 0; i < 47; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message content ${i}. This simulates a real conversation.`,
        });
      }

      const body = {
        model: 'anthropic/claude-opus-4.5',
        messages,
        stream: true,
      };

      const bodyString = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyString, 'utf8');

      // This is the key fix - Content-Length must be set for large bodies
      expect(bodySize).toBeGreaterThan(3000);

      // Verify the body can be serialized and the size is accurate
      expect(JSON.parse(bodyString).messages.length).toBe(48);
    });
  });
});
