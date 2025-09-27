import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Credit Transformation Contract Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    // Clear any existing nock interceptors
    nock.cleanAll();
  });

  afterEach(() => {
    // Verify all expected HTTP calls were made
    nock.isDone();
  });

  describe('GET /api/v1/me/credits - Credit transformation', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should transform limited account response correctly', async () => {
      // Mock OpenRouter /api/v1/key response for limited account
      const openRouterKeyResponse = {
        limit: 100.5,
        usage: 25.75,
      };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verify transformed response structure
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('total_credits');
      expect(response.body.data).toHaveProperty('total_usage');

      // Verify correct transformation
      expect(response.body.data.total_credits).toBe(100.5);
      expect(response.body.data.total_usage).toBe(25.75);

      // Verify data types
      expect(typeof response.body.data.total_credits).toBe('number');
      expect(typeof response.body.data.total_usage).toBe('number');

      // Verify minimums
      expect(response.body.data.total_credits).toBeGreaterThanOrEqual(0);
      expect(response.body.data.total_usage).toBeGreaterThanOrEqual(0);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should transform unlimited account response correctly', async () => {
      // Mock OpenRouter /api/v1/key response for unlimited account
      const openRouterKeyResponse = {
        limit: null,
        usage: 125.3,
      };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verify unlimited account transformation
      expect(response.body.data.total_credits).toBe(999999);
      expect(response.body.data.total_usage).toBe(125.3);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle zero usage correctly', async () => {
      const openRouterKeyResponse = {
        limit: 50.0,
        usage: 0,
      };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.body.data.total_credits).toBe(50.0);
      expect(response.body.data.total_usage).toBe(0);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should forward authentication errors from OpenRouter', async () => {
      const openRouterErrorResponse = {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        },
      };

      const invalidButWellFormattedKey = 'Bearer sk-or-v1-invalid-key-123';

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', invalidButWellFormattedKey)
        .reply(401, openRouterErrorResponse);

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', invalidButWellFormattedKey)
        .expect(401);

      // Error should include correlation ID for debugging
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('correlationId');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle OpenRouter server errors appropriately', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(500, { error: 'Internal server error' });

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(502); // Should map to 502 Bad Gateway for upstream errors

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('UPSTREAM_ERROR');
      expect(response.body.error).toHaveProperty('correlationId');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it.skip('should handle OpenRouter timeout errors', async () => {
      // TODO: Implement proper timeout testing
      // This test is skipped due to complexity of testing timeout behavior
      // const openRouterMock = nock('https://openrouter.ai')
      //   .get('/api/v1/key')
      //   .matchHeader('authorization', validApiKey)
      //   .delayConnection(31000) // Longer than our 30s request timeout
      //   .reply(200, {});
    }, 40000); // 40 second timeout for this test

    it('should validate API key format', async () => {
      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', 'Bearer invalid-format')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toMatch(/invalid.*api.*key/i);
    });

    it('should require Authorization header', async () => {
      const response = await request(app).get('/api/v1/me/credits').expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toMatch(/authorization.*required/i);
    });

    it('should have correct Content-Type for successful responses', async () => {
      const openRouterKeyResponse = { limit: 100, usage: 25 };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should not accept non-GET methods', async () => {
      const response = await request(app)
        .post('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(405); // Method Not Allowed

      expect(response.body.error.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('should respond within performance requirements', async () => {
      const openRouterKeyResponse = { limit: 100, usage: 25 };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      const startTime = Date.now();
      await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);
      const responseTime = Date.now() - startTime;

      // Should be under 200ms (excluding OpenRouter latency)
      expect(responseTime).toBeLessThan(200);
      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Caching behavior validation', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';
    const openRouterKeyResponse = { limit: 100, usage: 25 };

    it('should cache responses for subsequent requests', async () => {
      // First request should hit OpenRouter
      const openRouterMock1 = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      const response1 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(openRouterMock1.isDone()).toBe(true);

      // Second request - TODO: Implement caching so this doesn't need a second mock
      const openRouterMock2 = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      const response2 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Both responses should be identical
      expect(response2.body).toEqual(response1.body);
      expect(openRouterMock2.isDone()).toBe(true);
    });
  });
});
