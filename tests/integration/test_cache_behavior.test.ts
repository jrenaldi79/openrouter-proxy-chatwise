import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Cache Behavior Validation Integration Tests', () => {
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

  describe('Scenario 3: Cache Behavior Validation', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';
    const openRouterKeyResponse = {
      limit: 100.5,
      usage: 25.75,
    };

    it('should cache credit responses for subsequent requests', async () => {
      // Setup: First request should hit OpenRouter API
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      // Action: First request - should call OpenRouter
      const response1StartTime = Date.now();
      const response1 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);
      const response1Time = Date.now() - response1StartTime;

      expect(openRouterMock.isDone()).toBe(true);

      // Action: Second request within cache TTL - should use cache
      const response2StartTime = Date.now();
      const response2 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);
      const response2Time = Date.now() - response2StartTime;

      // Verification: Second request served from cache (faster response)
      expect(response2Time).toBeLessThan(response1Time);
      expect(response2Time).toBeLessThan(50); // Cache hit should be very fast

      // Verification: Both responses identical
      expect(response2.body).toEqual(response1.body);

      // Verification: Cache hit indicated in headers
      expect(response1.headers['x-cache']).toBe('MISS');
      expect(response2.headers['x-cache']).toBe('HIT');
    });

    it('should cache responses per API key independently', async () => {
      const apiKey1 = 'Bearer sk-or-v1-key-1';
      const apiKey2 = 'Bearer sk-or-v1-key-2';

      const response1 = { limit: 100, usage: 25 };
      const response2 = { limit: 200, usage: 50 };

      // Setup mocks for different API keys
      const mock1 = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', apiKey1)
        .reply(200, response1);

      const mock2 = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', apiKey2)
        .reply(200, response2);

      // First request with API key 1
      const result1 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', apiKey1)
        .expect(200);

      // First request with API key 2
      const result2 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', apiKey2)
        .expect(200);

      // Verify different responses
      expect(result1.body.data.total_credits).toBe(100);
      expect(result2.body.data.total_credits).toBe(200);

      expect(mock1.isDone()).toBe(true);
      expect(mock2.isDone()).toBe(true);

      // Second requests should use cache
      const cached1 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', apiKey1)
        .expect(200);

      const cached2 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', apiKey2)
        .expect(200);

      // Verify cached responses
      expect(cached1.body).toEqual(result1.body);
      expect(cached2.body).toEqual(result2.body);
      expect(cached1.headers['x-cache']).toBe('HIT');
      expect(cached2.headers['x-cache']).toBe('HIT');
    });

    it('should expire cache after TTL and make new requests', async () => {
      // Setup: Mock first response
      const firstMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { limit: 100, usage: 25 });

      // First request
      const response1 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response1.headers['x-cache']).toBe('MISS');
      expect(firstMock.isDone()).toBe(true);

      // Wait for cache to expire (this would be a longer test in real implementation)
      // For testing purposes, we'll simulate cache expiry by calling a cache clear endpoint
      await request(app).delete('/internal/cache').expect(200); // Internal endpoint to clear cache for testing

      // Setup: Mock second response with different data
      const secondMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { limit: 100, usage: 30 }); // Updated usage

      // Second request after cache expiry
      const response2 = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verification: New request made after cache expiry
      expect(response2.headers['x-cache']).toBe('MISS');
      expect(response2.body.data.total_usage).toBe(30); // Updated value
      expect(secondMock.isDone()).toBe(true);
    });

    it('should handle cache misses gracefully when cache is disabled', async () => {
      // This test assumes cache can be disabled via environment variable
      process.env.CACHE_TTL_SECONDS = '0'; // Disable cache

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse)
        .persist(); // Allow multiple calls

      // Multiple requests should all hit OpenRouter when cache is disabled
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .get('/api/v1/me/credits')
          .set('Authorization', validApiKey)
          .expect(200);

        expect(response.headers['x-cache']).toBe('DISABLED');
      }

      // Reset environment
      delete process.env.CACHE_TTL_SECONDS;
    });

    it('should provide cache statistics and metrics', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse);

      // Make several requests to populate cache metrics
      await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Check cache statistics via internal endpoint
      const statsResponse = await request(app)
        .get('/internal/cache/stats')
        .expect(200);

      expect(statsResponse.body).toHaveProperty('hits');
      expect(statsResponse.body).toHaveProperty('misses');
      expect(statsResponse.body).toHaveProperty('hitRate');
      expect(statsResponse.body).toHaveProperty('totalKeys');

      expect(statsResponse.body.hits).toBe(2); // 2 cache hits
      expect(statsResponse.body.misses).toBe(1); // 1 cache miss
      expect(statsResponse.body.hitRate).toBeCloseTo(0.67, 2); // 67% hit rate

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle cache errors gracefully without affecting functionality', async () => {
      // Simulate cache service failure
      // This would be implemented by mocking the cache service to throw errors

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, openRouterKeyResponse)
        .persist();

      // Requests should still work even if cache fails
      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.body.data.total_credits).toBe(100.5);
      expect(response.headers['x-cache']).toBe('ERROR'); // Indicates cache error
    });

    it('should respect cache size limits and implement LRU eviction', async () => {
      // This test would verify that cache doesn't grow beyond configured limits
      // and implements Least Recently Used (LRU) eviction policy

      const apiKeys = Array.from(
        { length: 10 },
        (_, i) => `Bearer sk-or-v1-key-${i.toString().padStart(3, '0')}`
      );

      // Setup mocks for all API keys
      apiKeys.forEach((key, index) => {
        nock('https://openrouter.ai')
          .get('/api/v1/key')
          .matchHeader('authorization', key)
          .reply(200, { limit: 100, usage: index });
      });

      // Fill cache beyond limit (assuming limit is 5 for testing)
      for (const key of apiKeys) {
        await request(app)
          .get('/api/v1/me/credits')
          .set('Authorization', key)
          .expect(200);
      }

      // Check cache statistics
      const statsResponse = await request(app)
        .get('/internal/cache/stats')
        .expect(200);

      // Cache should not exceed configured maximum size
      expect(statsResponse.body.totalKeys).toBeLessThanOrEqual(5);
    });
  });

  describe('Cache performance characteristics', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should provide consistent cache hit performance', async () => {
      // Setup initial cache entry
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { limit: 100, usage: 25 });

      await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(openRouterMock.isDone()).toBe(true);

      // Measure cache hit times
      const cacheTimes = [];
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await request(app)
          .get('/api/v1/me/credits')
          .set('Authorization', validApiKey)
          .expect(200);
        cacheTimes.push(Date.now() - startTime);
      }

      // All cache hits should be fast and consistent
      cacheTimes.forEach(time => {
        expect(time).toBeLessThan(50); // Under 50ms for cache hits
      });

      // Calculate variance to ensure consistency
      const average = cacheTimes.reduce((a, b) => a + b) / cacheTimes.length;
      const variance =
        cacheTimes.reduce((sum, time) => sum + Math.pow(time - average, 2), 0) /
        cacheTimes.length;

      expect(variance).toBeLessThan(100); // Low variance indicates consistent performance
    });

    it('should handle concurrent cache access efficiently', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { limit: 100, usage: 25 });

      // First request to populate cache
      await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(openRouterMock.isDone()).toBe(true);

      // Concurrent cache access
      const concurrentRequests = 20;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/api/v1/me/credits').set('Authorization', validApiKey)
      );

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      results.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.headers['x-cache']).toBe('HIT');
      });

      // Concurrent cache access should be very fast
      expect(totalTime).toBeLessThan(500); // 20 concurrent cache hits in under 500ms
    });
  });
});
