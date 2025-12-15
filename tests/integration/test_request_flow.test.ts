import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';
import { ensureModelsMock } from '../setup';

describe('Request Flow Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Ensure models mock exists before createApp() triggers modelDataService.fetchModels()
    ensureModelsMock();
    app = await createApp();
    // Wait for the async model fetch to complete to avoid race conditions
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(() => {
    // Clear all mocks - each test sets up its own specific mocks
    nock.cleanAll();
  });

  afterEach(() => {
    nock.isDone();
  });

  describe('Credit Transformation Flow', () => {
    it('should integrate full credit transformation request flow', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      // Mock the actual OpenRouter /api/v1/key endpoint
      nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: {
            label: 'Test API Key',
            limit: 500,
            usage: 150,
            is_free_tier: false,
          },
        });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verify the complete transformation flow:
      // 1. Request received at /v1/credits
      // 2. Transformed to /api/v1/key internally
      // 3. Response transformed back to credits format
      expect(response.body.data).toHaveProperty('total_credits');
      expect(response.body.data).toHaveProperty('total_usage');
      expect(response.body.data.total_credits).toBe(500); // limit
      expect(response.body.data.total_usage).toBe(150);

      // Verify headers are properly set through the flow
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should handle credit transformation error flow', async () => {
      const validApiKey = 'Bearer sk-or-v1-invalid-key';

      nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(401, {
          error: {
            code: 'invalid_api_key',
            message: 'Invalid API key provided',
          },
        });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(401);

      // Verify error flows through transformation pipeline correctly
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Passthrough Flow', () => {
    it('should integrate full passthrough request flow', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: [
            {
              id: 'openai/gpt-3.5-turbo',
              name: 'GPT-3.5 Turbo',
              pricing: { prompt: '0.0000015', completion: '0.000002' },
            },
            {
              id: 'anthropic/claude-3-haiku',
              name: 'Claude 3 Haiku',
              pricing: { prompt: '0.00000025', completion: '0.00000125' },
            },
          ],
        });

      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', validApiKey)
        .set('Accept', 'application/json')
        .expect(200);

      // Verify passthrough flow maintains original structure
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('name');
      expect(response.body.data[0]).toHaveProperty('pricing');

      // Our middleware should still be applied
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should integrate chat completion flow', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          id: 'chatcmpl-test123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-3.5-turbo',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello! How can I help you today?',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 15,
            total_tokens: 25,
          },
        });

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Authorization', validApiKey)
        .set('Content-Type', 'application/json')
        .send({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello!' }],
          max_tokens: 50,
        })
        .expect(200);

      // Verify chat completion response structure maintained
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('choices');
      expect(response.body.choices[0]).toHaveProperty('message');
      expect(response.body.choices[0].message.content).toBe(
        'Hello! How can I help you today?'
      );

      // Our middleware integration
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should integrate authentication with subsequent processing', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          data: {
            label: 'My API Key',
            limit: 1000,
            usage: 200,
            rate_limit: {
              requests_per_minute: 60,
              tokens_per_minute: 40000,
            },
          },
        });

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verify auth endpoint maintains OpenRouter response structure
      expect(response.body.data).toHaveProperty('label');
      expect(response.body.data).toHaveProperty('limit');
      expect(response.body.data).toHaveProperty('usage');
      expect(response.body.data).toHaveProperty('rate_limit');

      // Middleware integration still works
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should integrate authentication failure with error handling', async () => {
      const response = await request(app).get('/v1/credits').expect(401);

      // Verify authentication failure integrates with error middleware
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error.code).toBe('UNAUTHORIZED');

      // Error tracking still works
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Header Processing Integration', () => {
    it('should integrate header filtering with request forwarding', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      // Mock should receive clean headers (problematic ones filtered out)
      nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        // These headers should NOT be present due to filtering
        .reply(function () {
          // Verify problematic headers were filtered out
          expect(this.req.headers['x-forwarded-for']).toBeUndefined();
          expect(this.req.headers['connection']).not.toBe('keep-alive'); // Original malicious value filtered
          expect(this.req.headers['host']).not.toBe('malicious-host.com');

          return [200, { data: [{ id: 'test-model' }] }];
        });

      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', validApiKey)
        .set('X-Forwarded-For', '192.168.1.1') // Should be filtered
        .set('Connection', 'keep-alive') // Should be filtered
        .set('Host', 'malicious-host.com') // Should be filtered
        .set('Custom-Header', 'should-remain') // Should pass through
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Error Propagation Integration', () => {
    it('should integrate upstream errors with our error handling', async () => {
      const validApiKey = 'Bearer sk-or-v1-test-key-123';

      nock('https://openrouter.ai')
        .get('/api/v1/key')
        .matchHeader('authorization', validApiKey)
        .reply(503, {
          error: {
            code: 'service_unavailable',
            message: 'OpenRouter API is temporarily unavailable',
          },
        });

      const response = await request(app)
        .get('/v1/credits')
        .set('Authorization', validApiKey)
        .expect(502);

      // Verify upstream errors integrate with our error handling
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('UPSTREAM_ERROR');

      // Our error tracking middleware still applies
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });
});
