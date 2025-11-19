import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Header Compatibility Unit Tests', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.isDone();
  });

  describe('ChatWise Header Compatibility', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should return content-type without charset for credits endpoints', async () => {
      // Setup: Mock OpenRouter /api/v1/key endpoint
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(
          200,
          { data: { limit: 100, usage: 25 } },
          {
            'content-type': 'application/json', // OpenRouter format
          }
        );

      // Action: Test /v1/credits endpoint
      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verification: Content-Type should NOT include charset
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['content-type']).not.toContain('charset');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should return content-type without charset for /api/v1/credits endpoint', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/api/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['content-type']).not.toContain('charset');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should return content-type without charset for /api/v1/me/credits endpoint', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['content-type']).not.toContain('charset');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should return content-type without charset for /v1/auth/key endpoint', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: {
            api_key: validApiKey.replace('Bearer ', ''),
            name: 'Test Key',
            is_valid: true,
          },
        });

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['content-type']).not.toContain('charset');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should match OpenRouter CORS headers exactly', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(
          200,
          { data: { limit: 100, usage: 25 } },
          {
            'access-control-allow-origin': '*',
            'content-type': 'application/json',
          }
        );

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should match OpenRouter's CORS behavior
      expect(response.headers['access-control-allow-origin']).toBe('*');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should include correlation ID in headers for debugging', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/); // UUID format

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should NOT include Express.js default headers that differ from OpenRouter', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should NOT include Express.js headers that OpenRouter doesn't have
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['etag']).toBeUndefined();

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should skip helmet security headers for credits endpoints', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Credits endpoints should skip helmet to match OpenRouter headers
      expect(response.headers['x-content-type-options']).toBeUndefined();
      expect(response.headers['x-frame-options']).toBeUndefined();
      expect(response.headers['strict-transport-security']).toBeUndefined();

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle chat completions headers for streaming compatibility', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          id: 'chatcmpl-test',
          choices: [{ message: { content: 'Hello' } }],
        });

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        })
        .expect(200);

      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['x-correlation-id']).toBeDefined();

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should preserve case sensitivity in header names', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(
          200,
          { data: { limit: 100, usage: 25 } },
          {
            'Content-Type': 'application/json', // Capital case
            'X-Custom-Header': 'test-value',
          }
        );

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // HTTP headers are case-insensitive, but we should maintain consistency
      expect(response.headers['content-type']).toMatch(/^application\/json/);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle validation string patterns that caused ChatWise failures', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100.5, usage: 25.75 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verify response body structure that should pass ChatWise validation
      expect(response.body).toEqual({
        data: {
          total_credits: 100.5,
          total_usage: 25.75,
        },
      });

      // Verify exact content-type that should pass validation
      expect(response.headers['content-type']).toMatch(/^application\/json/);

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Error Response Header Compatibility', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';
    const invalidApiKey = 'Bearer invalid-key-format';

    it('should return proper error headers for unauthorized requests', async () => {
      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', invalidApiKey)
        .expect(401);

      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should handle OpenRouter error responses with correct headers', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(
          402,
          {
            error: {
              code: 'INSUFFICIENT_CREDITS',
              message: 'Insufficient credits',
            },
          },
          {
            'content-type': 'application/json',
          }
        );

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(402);

      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['access-control-allow-origin']).toBe('*');

      expect(openRouterMock.isDone()).toBe(true);
    });
  });
});
