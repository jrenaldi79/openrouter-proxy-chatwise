import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Credit Transformation Flow Integration Tests', () => {
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

  describe('Scenario 2: Credit Transformation Flow', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should complete full credit transformation flow', async () => {
      // Setup: Mock OpenRouter /api/v1/key endpoint
      const openRouterKeyResponse = {
        limit: 100.5,
        usage: 25.75,
        balance: 74.75,
        rate_limit: {
          requests: 1000,
          interval: '1h',
        },
      };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse, {
          'content-type': 'application/json',
          'x-ratelimit-remaining': '999',
        });

      // Action: Send GET to /api/v1/me/credits
      const startTime = Date.now();
      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      const responseTime = Date.now() - startTime;

      // Verification: Response format matches expected schema
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('total_credits');
      expect(response.body.data).toHaveProperty('total_usage');

      // Verification: Data mapped correctly from /api/v1/key response
      expect(response.body.data.total_credits).toBe(100.5);
      expect(response.body.data.total_usage).toBe(25.75);

      // Verification: Transformation time within performance budget
      expect(responseTime).toBeLessThan(200);

      // Verification: Content-Type is correct
      expect(response.headers['content-type']).toMatch(/application\/json/);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle unlimited account transformation correctly', async () => {
      const openRouterKeyResponse = {
        limit: null, // Unlimited account
        usage: 1250.3,
      };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verification: Unlimited account gets 999999 credits
      expect(response.body.data.total_credits).toBe(999999);
      expect(response.body.data.total_usage).toBe(1250.3);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should transform various numeric edge cases correctly', async () => {
      const testCases = [
        { limit: 0, usage: 0, expectedCredits: 0, expectedUsage: 0 },
        {
          limit: 0.01,
          usage: 0.01,
          expectedCredits: 0.01,
          expectedUsage: 0.01,
        },
        {
          limit: 999999.99,
          usage: 500000.5,
          expectedCredits: 999999.99,
          expectedUsage: 500000.5,
        },
        { limit: null, usage: 0, expectedCredits: 999999, expectedUsage: 0 },
      ];

      for (const testCase of testCases) {
        const openRouterMock = nock('https://openrouter.ai')
          .get('/api/v1/key')
          .matchHeader('authorization', validApiKey)
          .reply(200, { limit: testCase.limit, usage: testCase.usage });

        const response = await request(app)
          .get('/api/v1/me/credits')
          .set('Authorization', validApiKey)
          .expect(200);

        expect(response.body.data.total_credits).toBe(testCase.expectedCredits);
        expect(response.body.data.total_usage).toBe(testCase.expectedUsage);

        expect(openRouterMock.isDone()).toBe(true);
        nock.cleanAll();
      }
    });

    it('should preserve authorization headers correctly', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { limit: 100, usage: 25 });

      await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should include correlation ID in successful responses', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { limit: 100, usage: 25 });

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Response should include correlation ID for request tracing
      expect(response.headers).toHaveProperty('x-correlation-id');
      expect(response.headers['x-correlation-id']).toMatch(/^[a-f0-9-]{36}$/); // UUID format

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle response headers preservation', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(
          200,
          { limit: 100, usage: 25 },
          {
            'x-ratelimit-remaining': '99',
            'x-openrouter-trace-id': 'trace-12345',
          }
        );

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Some headers from OpenRouter should be preserved
      expect(response.headers['x-ratelimit-remaining']).toBe('99');

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Error handling in credit transformation', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should handle malformed OpenRouter responses gracefully', async () => {
      // Missing required 'usage' field
      const malformedResponse = { limit: 100 }; // Missing usage field

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, malformedResponse);

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(response.body.error.message).toMatch(/invalid.*response/i);
      expect(response.body.error).toHaveProperty('correlationId');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle non-numeric values in OpenRouter response', async () => {
      const invalidResponse = {
        limit: 'not-a-number',
        usage: 'also-not-a-number',
      };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, invalidResponse);

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(500);

      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(response.body.error.message).toMatch(/invalid.*data.*type/i);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle OpenRouter API authentication errors', async () => {
      const authErrorResponse = {
        error: {
          message: 'Invalid API key provided',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', 'Bearer invalid-key')
        .reply(401, authErrorResponse);

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', 'Bearer invalid-key')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error).toHaveProperty('correlationId');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle OpenRouter API rate limiting', async () => {
      const rateLimitResponse = {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
        },
      };

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(429, rateLimitResponse, {
          'retry-after': '60',
        });

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(429);

      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers['retry-after']).toBe('60');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle OpenRouter API server errors', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(500, { error: 'Internal server error' });

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(502); // Should map to 502 Bad Gateway

      expect(response.body.error.code).toBe('UPSTREAM_ERROR');
      expect(response.body.error.message).toMatch(/openrouter.*unavailable/i);
      expect(response.body.error).toHaveProperty('correlationId');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle network timeouts appropriately', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .delayConnection(35000) // Longer than request timeout
        .reply(200, {});

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .timeout(5000);

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe('UPSTREAM_ERROR');
      expect(response.body.error.message).toMatch(/timeout/i);

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Performance and reliability', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should maintain consistent performance under load', async () => {
      const responses = [];
      const concurrentRequests = 10;

      // Setup mocks for concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        nock('https://openrouter.ai')
          .get('/api/v1/key')
          .matchHeader('authorization', validApiKey)
          .reply(200, { limit: 100, usage: i });
      }

      // Execute concurrent requests
      const startTime = Date.now();
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/api/v1/me/credits').set('Authorization', validApiKey)
      );

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      results.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data).toHaveProperty('total_credits');
        expect(response.body.data).toHaveProperty('total_usage');
      });

      // Performance should be reasonable even under load
      expect(totalTime).toBeLessThan(2000); // 10 concurrent requests in under 2 seconds
    });
  });
});
