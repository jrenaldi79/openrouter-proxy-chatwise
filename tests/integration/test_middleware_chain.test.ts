import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Middleware Chain Integration Tests', () => {
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

  describe('Request Processing Pipeline', () => {
    it('should process request through complete middleware chain', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      // Mock the OpenRouter API
      nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: { limit: 100, usage: 25 } });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .set('User-Agent', 'ChatWise/1.0')
        .expect(200);

      // Verify middleware chain worked correctly:
      // 1. CORS middleware set headers
      expect(response.headers['access-control-allow-origin']).toBeDefined();

      // 2. Security middleware added correlation ID
      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-correlation-id']).toMatch(/^[a-f0-9-]{36}$/);

      // 3. Auth middleware validated token
      // 4. Transformation middleware converted response
      expect(response.body.data).toHaveProperty('total_credits');
      expect(response.body.data).toHaveProperty('total_usage');
      expect(response.body.data.total_credits).toBe(100); // limit
      expect(response.body.data.total_usage).toBe(25);

      // 5. Response middleware set content type
      expect(response.headers['content-type']).toMatch(/^application\/json/);
    });

    it('should handle authentication failure through middleware chain', async () => {
      const response = await request(app)
        .get('/v1/credits')
        .set('User-Agent', 'ChatWise/1.0')
        .expect(401);

      // Verify error handling middleware worked:
      // 1. Still has CORS headers
      expect(response.headers['access-control-allow-origin']).toBeDefined();

      // 2. Still has correlation ID for error tracking
      expect(response.headers['x-correlation-id']).toBeDefined();

      // 3. Proper error response structure
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');

      // 4. Content type still set
      expect(response.headers['content-type']).toMatch(/^application\/json/);
    });
  });

  describe('Request Transformation Integration', () => {
    it('should integrate request transformation with proxy forwarding', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      // Mock for passthrough endpoint (should receive transformed headers)
      nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: [
            { id: 'model-1', name: 'Test Model 1' },
            { id: 'model-2', name: 'Test Model 2' },
          ],
        });

      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', validApiKey)
        .set('X-Forwarded-For', '192.168.1.1') // Should be filtered out
        .set('Custom-Header', 'should-pass-through')
        .expect(200);

      // Verify integration between header filtering and proxy forwarding
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toHaveLength(2);

      // Correlation ID should be added by our middleware
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should integrate credit transformation with error handling', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      // Mock OpenRouter API to return error
      nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(429, {
          error: {
            code: 'rate_limit_exceeded',
            message: 'Rate limit exceeded',
          },
        });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(429);

      // Verify error is properly passed through transformation pipeline
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');

      // Our middleware should still add correlation ID for error tracking
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Response Processing Integration', () => {
    it('should integrate response transformation with content-type handling', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      nock('https://openrouter.ai')
        .get('/api/v1/key')
        .reply(
          200,
          { data: { limit: 200, usage: 50 } },
          {
            'Content-Type': 'application/json; charset=utf-8',
          }
        );

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verify response processing integration
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.body.data.total_credits).toBe(200); // limit
      expect(response.body.data.total_usage).toBe(50);
    });

    it('should integrate streaming response handling', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .reply(200, {
          id: 'chatcmpl-test',
          object: 'chat.completion',
          choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
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

      // Verify chat completion integration
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('choices');
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Health Check Integration', () => {
    it('should integrate health check with monitoring middleware', async () => {
      const response = await request(app).get('/health').expect(200);

      // Verify health endpoint integrates with our middleware
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('openrouterConnectivity');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('timestamp');

      // Should still get correlation ID even for health checks
      expect(response.headers['x-correlation-id']).toBeDefined();

      // Should still get CORS headers
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
