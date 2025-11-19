import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Proxy Passthrough Contract Tests', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(() => {
    // Clear any existing nock interceptors
    nock.cleanAll();
  });

  afterEach(() => {
    // Verify all expected HTTP calls were made
    nock.isDone();
  });

  describe('GET /api/v1/models - Passthrough behavior', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';
    const mockOpenRouterResponse = {
      data: [
        { id: 'model-1', name: 'Test Model 1' },
        { id: 'model-2', name: 'Test Model 2' },
      ],
    };

    it('should forward request to OpenRouter API without modification', async () => {
      // Mock OpenRouter API response
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, mockOpenRouterResponse, {
          'content-type': 'application/json',
          'x-custom-header': 'test-value',
        });

      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verify exact response passthrough
      expect(response.body).toEqual(mockOpenRouterResponse);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['x-custom-header']).toBe('test-value');

      // Verify the mock was called
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should preserve all request headers in passthrough', async () => {
      const customHeaders = {
        authorization: validApiKey,
        'x-custom-client': 'test-client',
        'user-agent': 'test-agent/1.0',
      };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .matchHeader('x-custom-client', 'test-client')
        .matchHeader('user-agent', 'test-agent/1.0')
        .reply(200, mockOpenRouterResponse);

      await request(app).get('/api/v1/models').set(customHeaders).expect(200);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should preserve query parameters in passthrough', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .query({ limit: '10', offset: '0', filter: 'gpt' })
        .matchHeader('authorization', validApiKey)
        .reply(200, mockOpenRouterResponse);

      await request(app)
        .get('/api/v1/models?limit=10&offset=0&filter=gpt')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should forward authentication errors from OpenRouter', async () => {
      const openRouterErrorResponse = {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
        },
      };

      const invalidButValidFormatKey = 'Bearer sk-or-v1-invalid-key-12345678';
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', invalidButValidFormatKey)
        .reply(401, openRouterErrorResponse);

      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', invalidButValidFormatKey)
        .expect(401);

      expect(response.body).toEqual(openRouterErrorResponse);
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should forward server errors from OpenRouter', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(500, { error: 'Internal server error' });

      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', validApiKey)
        .expect(502); // 5xx errors are mapped to 502 for consistency

      // Response is transformed to standard error format
      expect(response.body.error.code).toBe('UPSTREAM_ERROR');
      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('POST /api/v1/chat/completions - Passthrough behavior', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';
    const chatRequest = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello, world!' }],
    };
    const chatResponse = {
      choices: [
        {
          message: { role: 'assistant', content: 'Hello! How can I help you?' },
        },
      ],
    };

    it('should forward POST requests with body preservation', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', chatRequest)
        .matchHeader('authorization', validApiKey)
        .matchHeader('content-type', /application\/json/)
        .reply(200, chatResponse);

      const response = await request(app)
        .post('/api/v1/chat/completions')
        .set('Authorization', validApiKey)
        .set('Content-Type', 'application/json')
        .send(chatRequest)
        .expect(200);

      expect(response.body).toEqual(chatResponse);
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should preserve request body and headers for POST requests', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', chatRequest)
        .matchHeader('authorization', validApiKey)
        .matchHeader('x-custom-header', 'test-value')
        .reply(200, chatResponse);

      await request(app)
        .post('/api/v1/chat/completions')
        .set('Authorization', validApiKey)
        .set('X-Custom-Header', 'test-value')
        .send(chatRequest)
        .expect(200);

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Edge cases and error handling', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it.skip('should handle network timeouts gracefully', async () => {
      // TODO: Implement timeout testing
      // const _openRouterMock = nock('https://openrouter.ai')
      //   .get('/api/v1/models')
      //   .matchHeader('authorization', validApiKey)
      //   .delayConnection(35000) // Longer than request timeout
      //   .reply(200, {});
    });

    it('should preserve HTTP methods other than GET and POST', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .delete('/api/v1/models/test-model')
        .matchHeader('authorization', validApiKey)
        .reply(204);

      await request(app)
        .delete('/api/v1/models/test-model')
        .set('Authorization', validApiKey)
        .expect(204);

      expect(openRouterMock.isDone()).toBe(true);
    });
  });
});
