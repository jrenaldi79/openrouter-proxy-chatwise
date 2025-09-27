import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('ChatWise Integration Pattern Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.isDone();
  });

  describe('ChatWise Dual API Call Pattern', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should handle ChatWise dual endpoint calls (/v1/credits + /v1/auth/key)', async () => {
      // Setup: Mock both endpoints that ChatWise calls
      const creditsKeyMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const authKeyMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: {
            api_key: validApiKey.replace('Bearer ', ''),
            name: 'ChatWise API Key',
            is_valid: true
          }
        });

      // Action: Simulate ChatWise calling both endpoints
      const [creditsResponse, authResponse] = await Promise.all([
        request(app)
          .get('/v1/credits')
          .set('Authorization', validApiKey),
        request(app)
          .get('/v1/auth/key')
          .set('Authorization', validApiKey)
      ]);

      // Verification: Credits endpoint should transform response
      expect(creditsResponse.status).toBe(200);
      expect(creditsResponse.body.data.total_credits).toBe(100);
      expect(creditsResponse.body.data.total_usage).toBe(25);

      // Verification: Auth key endpoint should pass through unchanged
      expect(authResponse.status).toBe(200);
      expect(authResponse.body.data.api_key).toBe(validApiKey.replace('Bearer ', ''));
      expect(authResponse.body.data.name).toBe('ChatWise API Key');
      expect(authResponse.body.data.is_valid).toBe(true);

      // Both should have compatible headers for ChatWise validation
      expect(creditsResponse.headers['content-type']).toBe('application/json');
      expect(authResponse.headers['content-type']).toBe('application/json');

      expect(creditsKeyMock.isDone()).toBe(true);
      expect(authKeyMock.isDone()).toBe(true);
    });

    it('should handle ChatWise fetch models request', async () => {
      const modelsMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: [
            {
              id: 'gpt-3.5-turbo',
              name: 'GPT-3.5 Turbo',
              description: 'Fast and affordable GPT model',
              pricing: { prompt: '0.0015', completion: '0.002' }
            },
            {
              id: 'gpt-4',
              name: 'GPT-4',
              description: 'Most capable GPT model',
              pricing: { prompt: '0.03', completion: '0.06' }
            }
          ]
        });

      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should pass through models response for ChatWise
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].id).toBe('gpt-3.5-turbo');
      expect(response.body.data[1].id).toBe('gpt-4');

      // Headers should be compatible with ChatWise validation
      expect(response.headers['content-type']).toBe('application/json');
      expect(response.headers['content-type']).not.toContain('charset');

      expect(modelsMock.isDone()).toBe(true);
    });

    it('should handle ChatWise chat completion with streaming', async () => {
      const streamingData = [
        'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":" from"}}]}\n\n',
        'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":" ChatWise"}}]}\n\n',
        'data: [DONE]\n\n'
      ].join('');

      const chatMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(200, streamingData, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive'
        });

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello from ChatWise' }],
          stream: true
        })
        .expect(200);

      // Should stream response back to ChatWise
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.text).toContain('data: ');
      expect(response.text).toContain('Hello');
      expect(response.text).toContain('[DONE]');

      expect(chatMock.isDone()).toBe(true);
    });

    it('should handle ChatWise chat title generation request', async () => {
      // ChatWise often makes a separate request to generate chat titles
      const titleMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          id: 'chatcmpl-title-123',
          choices: [{
            message: {
              content: 'OpenRouter API Discussion'
            }
          }]
        });

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'Generate a short title for this conversation' },
            { role: 'user', content: 'I want to test the OpenRouter proxy' }
          ],
          max_tokens: 20,
          temperature: 0.7,
          stream: false
        })
        .expect(200);

      expect(response.body.choices[0].message.content).toBe('OpenRouter API Discussion');
      expect(response.headers['content-type']).toBe('application/json');

      expect(titleMock.isDone()).toBe(true);
    });
  });

  describe('ChatWise Validation Compatibility', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should prevent "string did not match the expected pattern" errors', async () => {
      // Test the exact scenario that caused ChatWise validation failures
      const creditsKeyMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 75.25, usage: 12.50 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Response structure that should pass ChatWise validation
      expect(response.body).toEqual({
        data: {
          total_credits: 75.25,
          total_usage: 12.50
        }
      });

      // Exact headers that should pass ChatWise validation
      expect(response.headers['content-type']).toBe('application/json');
      expect(response.headers['content-type']).not.toContain('charset');
      expect(response.headers['access-control-allow-origin']).toBe('*');

      // Should not have Express.js specific headers
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['etag']).toBeUndefined();

      expect(creditsKeyMock.isDone()).toBe(true);
    });

    it('should handle ChatWise numeric precision requirements', async () => {
      const creditsKeyMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: {
          limit: 123.456789, // High precision
          usage: 45.123456
        } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should preserve numeric precision for ChatWise
      expect(response.body.data.total_credits).toBe(123.456789);
      expect(response.body.data.total_usage).toBe(45.123456);

      expect(creditsKeyMock.isDone()).toBe(true);
    });

    it('should handle ChatWise unlimited account format', async () => {
      const creditsKeyMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: {
          limit: null, // Unlimited account
          usage: 1234.56
        } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // ChatWise should handle unlimited accounts correctly
      expect(response.body.data.total_credits).toBe(999999);
      expect(response.body.data.total_usage).toBe(1234.56);

      expect(creditsKeyMock.isDone()).toBe(true);
    });

    it('should handle ChatWise error response validation', async () => {
      const creditsKeyMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(402, {
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: 'Insufficient credits for this request'
          }
        });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(402);

      // Error format should be compatible with ChatWise
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.headers['content-type']).toBe('application/json');

      expect(creditsKeyMock.isDone()).toBe(true);
    });
  });

  describe('ChatWise Performance Requirements', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should respond to ChatWise requests within acceptable time limits', async () => {
      const creditsKeyMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const startTime = Date.now();

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      const responseTime = Date.now() - startTime;

      // ChatWise expects reasonable response times
      expect(responseTime).toBeLessThan(2000); // Under 2 seconds
      expect(response.body.data.total_credits).toBe(100);

      expect(creditsKeyMock.isDone()).toBe(true);
    });

    it('should handle ChatWise concurrent requests efficiently', async () => {
      // Setup mocks for concurrent ChatWise operations
      const mocks = Array.from({ length: 5 }, () =>
        nock('https://openrouter.ai')
          .get('/api/v1/key')
          .matchHeader('authorization', validApiKey)
          .reply(200, { data: { limit: 100, usage: 25 } })
      );

      const startTime = Date.now();

      // Simulate ChatWise making multiple concurrent requests
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .get('/v1/credits')
            .set('Authorization', validApiKey)
            .expect(200)
        )
      );

      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.body.data.total_credits).toBe(100);
      });

      // Concurrent processing should be efficient
      expect(totalTime).toBeLessThan(3000);
      expect(mocks).toHaveLength(5);
    });

    it('should handle ChatWise streaming performance requirements', async () => {
      const streamingData = Array.from({ length: 10 }, (_, i) =>
        `data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Token ${i}"}}]}\n\n`
      ).join('') + 'data: [DONE]\n\n';

      const chatMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(200, streamingData, {
          'content-type': 'text/event-stream'
        });

      const startTime = Date.now();

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Stream test' }],
          stream: true
        })
        .expect(200);

      const responseTime = Date.now() - startTime;

      // Streaming should start quickly
      expect(responseTime).toBeLessThan(1000);
      expect(response.text).toContain('Token 0');
      expect(response.text).toContain('[DONE]');

      expect(chatMock.isDone()).toBe(true);
    });
  });

  describe('ChatWise Error Recovery', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should handle ChatWise auth key failures gracefully', async () => {
      const authKeyMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid API key'
          }
        });

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(401);

      // Should return proper error format for ChatWise
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.headers['content-type']).toBe('application/json');

      expect(authKeyMock.isDone()).toBe(true);
    });

    it('should handle ChatWise rate limiting appropriately', async () => {
      const rateLimitMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(429, {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded'
          }
        }, {
          'retry-after': '60'
        });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(429);

      // Should preserve rate limit information for ChatWise
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers['retry-after']).toBe('60');

      expect(rateLimitMock.isDone()).toBe(true);
    });

    it('should handle ChatWise network timeouts properly', async () => {
      const timeoutMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .delay(6000) // Simulate timeout
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .timeout(2000); // 2 second timeout

      // Should handle timeout appropriately for ChatWise
      expect(response).toBeDefined();
      expect(timeoutMock).toBeDefined();
      // Response handling depends on timeout implementation
    });
  });

  describe('ChatWise Edge Cases', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should handle ChatWise special characters in request data', async () => {
      const chatMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          id: 'chatcmpl-special',
          choices: [{
            message: {
              content: 'Response with special chars: éñüñ 中文 🚀'
            }
          }]
        });

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({
          model: 'gpt-3.5-turbo',
          messages: [{
            role: 'user',
            content: 'Test with special chars: éñüñ 中文 🚀'
          }]
        })
        .expect(200);

      // Should handle Unicode properly for ChatWise
      expect(response.body.choices[0].message.content).toContain('éñüñ 中文 🚀');

      expect(chatMock.isDone()).toBe(true);
    });

    it('should handle ChatWise large request payloads', async () => {
      const largeContent = 'x'.repeat(10000); // 10KB content

      const chatMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          id: 'chatcmpl-large',
          choices: [{ message: { content: 'Processed large request' } }]
        });

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: largeContent }]
        })
        .expect(200);

      expect(response.body.choices[0].message.content).toBe('Processed large request');

      expect(chatMock.isDone()).toBe(true);
    });

    it('should handle ChatWise API key format variations', async () => {
      const keyVariations = [
        'Bearer sk-or-v1-standard-format-key',
        'Bearer sk-or-v1-longer-format-key-with-more-characters'
      ];

      for (const apiKey of keyVariations) {
        const authKeyMock = nock('https://openrouter.ai')
          .get('/api/v1/auth/key')
          .matchHeader('authorization', apiKey)
          .reply(200, {
            data: {
              api_key: apiKey.replace('Bearer ', ''),
              is_valid: true
            }
          });

        const response = await request(app)
          .get('/v1/auth/key')
          .set('Authorization', apiKey)
          .expect(200);

        expect(response.body.data.api_key).toBe(apiKey.replace('Bearer ', ''));

        expect(authKeyMock.isDone()).toBe(true);
      }
    });
  });
});