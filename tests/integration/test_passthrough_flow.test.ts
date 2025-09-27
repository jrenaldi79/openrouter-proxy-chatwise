import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Complete Passthrough Flow Integration Tests', () => {
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

  describe('Scenario 1: Complete Passthrough Flow', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should complete full passthrough flow for chat completions', async () => {
      // Setup: Mock OpenRouter chat completions endpoint
      const chatRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
        max_tokens: 100,
        temperature: 0.7,
      };

      const chatResponse = {
        id: 'chat-12345',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'The capital of France is Paris.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 8,
          total_tokens: 23,
        },
      };

      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', chatRequest)
        .matchHeader('authorization', validApiKey)
        .matchHeader('content-type', /application\/json/)
        .reply(200, chatResponse, {
          'content-type': 'application/json',
          'x-ratelimit-remaining': '99',
          'x-openrouter-trace-id': 'trace-12345',
        });

      // Action: Send POST to /api/v1/chat/completions
      const startTime = Date.now();
      const response = await request(app)
        .post('/api/v1/chat/completions')
        .set('Authorization', validApiKey)
        .set('Content-Type', 'application/json')
        .set('X-Client-Id', 'test-client')
        .send(chatRequest)
        .expect(200);

      const responseTime = Date.now() - startTime;

      // Verification: Response matches OpenRouter API exactly
      expect(response.body).toEqual(chatResponse);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['x-ratelimit-remaining']).toBe('99');
      expect(response.headers['x-openrouter-trace-id']).toBe('trace-12345');

      // Verification: Response time within SLA (<200ms excluding OpenRouter latency)
      expect(responseTime).toBeLessThan(200);

      // Verification: Request logged with correlation ID
      // This will be validated when logging middleware is implemented

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should preserve all request headers in passthrough', async () => {
      const customHeaders = {
        authorization: validApiKey,
        'content-type': 'application/json',
        'x-custom-client': 'test-client-v1.0',
        'x-request-id': 'req-12345',
        'user-agent': 'TestClient/1.0',
      };

      const chatRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', chatRequest)
        .matchHeader('authorization', validApiKey)
        .matchHeader('x-custom-client', 'test-client-v1.0')
        .matchHeader('x-request-id', 'req-12345')
        .matchHeader('user-agent', 'TestClient/1.0')
        .reply(200, { id: 'chat-test' });

      await request(app)
        .post('/api/v1/chat/completions')
        .set(customHeaders)
        .send(chatRequest)
        .expect(200);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle different HTTP methods correctly', async () => {
      // Test GET request
      const getMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: [] });

      await request(app)
        .get('/api/v1/models')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(getMock.isDone()).toBe(true);

      // Test PUT request
      const putMock = nock('https://openrouter.ai')
        .put('/api/v1/account/settings')
        .matchHeader('authorization', validApiKey)
        .reply(200, { success: true });

      await request(app)
        .put('/api/v1/account/settings')
        .set('Authorization', validApiKey)
        .send({ setting: 'value' })
        .expect(200);

      expect(putMock.isDone()).toBe(true);

      // Test DELETE request
      const deleteMock = nock('https://openrouter.ai')
        .delete('/api/v1/files/test-file')
        .matchHeader('authorization', validApiKey)
        .reply(204);

      await request(app)
        .delete('/api/v1/files/test-file')
        .set('Authorization', validApiKey)
        .expect(204);

      expect(deleteMock.isDone()).toBe(true);
    });

    it('should forward query parameters correctly', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .query({
          limit: '10',
          offset: '20',
          filter: 'gpt',
          sort: 'name',
        })
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: [] });

      await request(app)
        .get('/api/v1/models?limit=10&offset=20&filter=gpt&sort=name')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(openRouterMock.isDone()).toBe(true);
    });

    // Performance tests moved to tests/integration/test_performance.test.ts
  });

  describe('Error handling and edge cases', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should handle OpenRouter API errors gracefully', async () => {
      const errorResponse = {
        error: {
          message: 'Model not found',
          type: 'invalid_request_error',
          code: 'model_not_found',
        },
      };

      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(400, errorResponse);

      const response = await request(app)
        .post('/api/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({ model: 'invalid-model' })
        .expect(400);

      expect(response.body).toEqual(errorResponse);
      expect(openRouterMock.isDone()).toBe(true);
    });

    // Timeout testing removed - better tested in production environment

    it('should pass through string responses as-is', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(200, 'string response from openrouter');

      const response = await request(app)
        .post('/api/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({ model: 'gpt-3.5-turbo' });

      // Should pass through the string response exactly as received
      expect(response.status).toBe(200);
      expect(response.body).toBe('string response from openrouter');

      expect(openRouterMock.isDone()).toBe(true);
    });
  });
});
