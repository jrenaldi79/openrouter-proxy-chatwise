import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';
import { ensureModelsMock } from '../setup';

describe('Endpoint Routing and Path Transformation Unit Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Ensure models mock exists before createApp() triggers modelDataService.fetchModels()
    ensureModelsMock();
    app = await createApp();
    // Wait for the async model fetch to complete to avoid race conditions
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(() => {
    // Clear test-specific mocks - this test sets up its own specific mocks
    nock.cleanAll();
  });

  afterEach(() => {
    // Verify test-specific mocks were consumed (except the persistent models mock)
    const pending = nock
      .pendingMocks()
      .filter(mock => !mock.includes('/api/v1/models'));
    if (pending.length > 0) {
      console.warn('Unconsumed mocks:', pending);
    }
  });

  describe('Path Transformation Logic', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should transform /v1/auth/key to /api/v1/auth/key correctly', async () => {
      // Setup: Mock the transformed path at OpenRouter
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key') // Should be transformed to this path
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: {
            api_key: validApiKey.replace('Bearer ', ''),
            name: 'Test Key',
            is_valid: true,
          },
        });

      // Action: Call the original /v1/auth/key endpoint
      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verification: Response should be successful
      expect(response.body.data).toHaveProperty('api_key');
      expect(response.body.data.is_valid).toBe(true);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should NOT double-transform paths that already have /api/v1', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key') // Should stay as /api/v1/auth/key
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: { api_key: 'test-key', is_valid: true },
        });

      // Action: Call endpoint that already has /api/v1 prefix
      const response = await request(app)
        .get('/api/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.body.data.is_valid).toBe(true);
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle /v1/credits transformation correctly', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key') // Credits endpoint calls /api/v1/key
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should transform to credit format
      expect(response.body.data).toHaveProperty('total_credits');
      expect(response.body.data).toHaveProperty('total_usage');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle /v1/models path transformation', async () => {
      // Set up a test-specific mock for models
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: [
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
            { id: 'gpt-4', name: 'GPT-4' },
          ],
        });

      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verify response
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle /v1/chat/completions path transformation', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions') // Should transform to /api/v1/chat/completions
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          id: 'chatcmpl-123',
          choices: [{ message: { content: 'Hello!' } }],
        });

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.choices[0].message.content).toBe('Hello!');

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Multiple Credit Endpoint Routing', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should route /v1/credits to credit transformation handler', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should use credit transformation
      expect(response.body.data.total_credits).toBe(100);
      expect(response.body.data.total_usage).toBe(25);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should route /api/v1/credits to credit transformation handler', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 200, usage: 50 } });

      const response = await request(app)
        .get('/api/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should use credit transformation
      expect(response.body.data.total_credits).toBe(200);
      expect(response.body.data.total_usage).toBe(50);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should route /api/v1/me/credits to credit transformation handler', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 300, usage: 75 } });

      const response = await request(app)
        .get('/api/v1/me/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should use credit transformation
      expect(response.body.data.total_credits).toBe(300);
      expect(response.body.data.total_usage).toBe(75);

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle all credit endpoints with same transformation logic', async () => {
      const endpoints = [
        '/v1/credits',
        '/api/v1/credits',
        '/api/v1/me/credits',
      ];
      const expectedResponse = { data: { limit: 150, usage: 37.5 } };

      // Setup mocks for all endpoints
      endpoints.forEach(() => {
        nock('https://openrouter.ai')
          .get('/api/v1/key')
          .matchHeader('authorization', validApiKey)
          .reply(200, expectedResponse);
      });

      // Test all endpoints
      const responses = await Promise.all(
        endpoints.map(endpoint =>
          request(app)
            .get(endpoint)
            .set('Authorization', validApiKey)
            .expect(200)
        )
      );

      // All should return same transformed format
      responses.forEach(response => {
        expect(response.body.data.total_credits).toBe(150); // limit
        expect(response.body.data.total_usage).toBe(37.5); // usage
      });
    });
  });

  describe('Middleware Skip Logic', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should skip helmet middleware for credits endpoints', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should NOT have helmet security headers
      expect(response.headers['x-content-type-options']).toBeUndefined();
      expect(response.headers['x-frame-options']).toBeUndefined();
      expect(response.headers['strict-transport-security']).toBeUndefined();

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should skip helmet middleware for auth/key endpoint', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { api_key: 'test-key' } });

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should NOT have helmet security headers
      expect(response.headers['x-content-type-options']).toBeUndefined();
      expect(response.headers['x-frame-options']).toBeUndefined();

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should skip helmet middleware for models endpoint', async () => {
      // Set up a test-specific mock for models
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: [] });

      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should NOT have helmet security headers
      expect(response.headers['x-content-type-options']).toBeUndefined();
      expect(response.body.data).toBeDefined();
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should skip helmet middleware for chat completions', async () => {
      // Use body matcher function to accept any body (proxy may modify it)
      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', () => true) // Accept any body
        .matchHeader('authorization', validApiKey)
        .reply(200, { id: 'chat-123' });

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
        })
        .expect(200);

      // Should NOT have helmet security headers
      expect(response.headers['x-content-type-options']).toBeUndefined();

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should apply helmet middleware for non-API endpoints', async () => {
      const response = await request(app).get('/health').expect(200);

      // Non-API endpoints should have helmet security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('Error Handling in Routing', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';
    const invalidApiKey = 'Bearer invalid-key';

    it('should handle 404 errors for non-existent endpoints correctly', async () => {
      // Mock OpenRouter to return 404 for non-existent endpoint
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/nonexistent')
        .matchHeader('authorization', invalidApiKey)
        .reply(404, { error: { message: 'Endpoint not found' } });

      const response = await request(app)
        .get('/v1/nonexistent')
        .set('Authorization', invalidApiKey)
        .expect(404);

      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error.code).toBe('NOT_FOUND');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle routing errors without hanging', async () => {
      // This test ensures the proxy doesn't hang on invalid requests
      // The proxy forwards requests to OpenRouter which validates the API key
      const startTime = Date.now();

      // Mock OpenRouter to return 401 for invalid API key
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', invalidApiKey)
        .reply(401, {
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        });

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', invalidApiKey)
        .expect(401); // OpenRouter returns 401, proxy maps to UPSTREAM_ERROR with 401

      const responseTime = Date.now() - startTime;

      // Should respond quickly, not hang
      expect(responseTime).toBeLessThan(1000);
      expect(response.body.error).toHaveProperty('code');
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle OpenRouter errors in path transformation', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(500, {
          error: { code: 'INTERNAL_ERROR', message: 'Server error' },
        });

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(500);

      expect(response.body.error.code).toBe('UPSTREAM_ERROR');

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Query Parameter and Body Forwarding', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should forward query parameters in path transformation', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .query({ limit: '10', offset: '5' }) // Query parameters should be forwarded
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: [] });

      const response = await request(app)
        .get('/v1/models?limit=10&offset=5')
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.body.data).toBeDefined();

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should forward request body in POST requests', async () => {
      const requestBody = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      };

      // Use body matcher that verifies essential fields are present
      // (proxy may add fields like provider routing)
      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', (body: Record<string, unknown>) => {
          // Verify the essential request body fields are forwarded
          return (
            body.model === 'gpt-3.5-turbo' &&
            body.temperature === 0.7 &&
            Array.isArray(body.messages) &&
            body.messages.length === 1
          );
        })
        .matchHeader('authorization', validApiKey)
        .reply(200, { id: 'chat-123' });

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send(requestBody)
        .expect(200);

      expect(response.body.id).toBe('chat-123');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle complex query parameters correctly', async () => {
      // Use a more flexible query matcher
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .query(true) // Match any query parameters
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: [] });

      // Build query string manually to handle array properly
      const params = new URLSearchParams();
      params.append('filter[type]', 'gpt');
      params.append('sort', 'name');
      params.append('include[]', 'pricing');
      params.append('include[]', 'limits');
      const queryString = params.toString();

      const response = await request(app)
        .get(`/v1/models?${queryString}`)
        .set('Authorization', validApiKey)
        .expect(200);

      expect(response.body.data).toBeDefined();

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Performance of Path Transformation', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should handle path transformation with minimal overhead', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { api_key: 'test' } });

      const startTime = Date.now();

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      const responseTime = Date.now() - startTime;

      // Path transformation should add minimal latency
      expect(responseTime).toBeLessThan(200);
      expect(response.body.data).toHaveProperty('api_key');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle concurrent path transformations efficiently', async () => {
      const endpoints = ['/v1/auth/key', '/v1/models', '/v1/credits'];

      // Setup mocks for all endpoints
      nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { api_key: 'test' } });

      nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: [] });

      nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const startTime = Date.now();

      // Send concurrent requests
      const responses = await Promise.all(
        endpoints.map(endpoint =>
          request(app)
            .get(endpoint)
            .set('Authorization', validApiKey)
            .expect(200)
        )
      );

      const totalTime = Date.now() - startTime;

      // All should succeed
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Concurrent processing should be efficient
      expect(totalTime).toBeLessThan(1000);
    });
  });
});
