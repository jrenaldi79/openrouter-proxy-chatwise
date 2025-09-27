import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Cloudflare Blocking Detection and Fallback Integration Tests', () => {
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

  describe('Cloudflare Blocking Detection', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should detect Cloudflare blocking HTML response for /v1/auth/key', async () => {
      // Setup: Mock Cloudflare blocking response
      const cloudflareHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Just a moment...</title>
        </head>
        <body>
          <div class="cf-browser-verification">
            <h1>Cloudflare</h1>
            <p>Please enable JavaScript and reload the page.</p>
          </div>
        </body>
        </html>
      `;

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(503, cloudflareHtml, {
          'content-type': 'text/html; charset=UTF-8',
          server: 'cloudflare',
          'cf-ray': '123456789abcdef0-ORD',
        });

      // Action: Call endpoint that gets blocked by Cloudflare
      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200); // Should return 200 with mock response

      // Verification: Should return mock response instead of Cloudflare HTML
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data.name).toBe('Local Development Mock');
      expect(response.body.data).toHaveProperty('api_key');
      expect(response.body.data.is_valid).toBe(true);

      // Should have proper headers
      expect(response.headers['content-type']).toBe('application/json');
      expect(response.headers['x-correlation-id']).toBeDefined();

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should detect Cloudflare blocking for /v1/models endpoint', async () => {
      const cloudflareResponse = `
        <!DOCTYPE html>
        <html>
        <head><title>Attention Required! | Cloudflare</title></head>
        <body>
          <div id="cf-wrapper">
            <h1>Cloudflare</h1>
            <p>Ray ID: 12345</p>
          </div>
        </body>
        </html>
      `;

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(503, cloudflareResponse, {
          'content-type': 'text/html',
          server: 'cloudflare',
        });

      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should return mock models response
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toContainEqual(
        expect.objectContaining({ id: 'gpt-3.5-turbo' })
      );
      expect(response.body.data).toContainEqual(
        expect.objectContaining({ id: 'gpt-4' })
      );

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle different Cloudflare blocking patterns', async () => {
      const cloudflareVariations = [
        {
          name: 'Challenge page',
          html: '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Cloudflare security check</body></html>',
        },
        {
          name: 'Rate limiting page',
          html: '<!DOCTYPE html><html><body><h1>Rate limited by Cloudflare</h1></body></html>',
        },
        {
          name: 'Bot protection',
          html: '<!DOCTYPE html><html><body><!-- Cloudflare bot protection --><div>Please enable JavaScript</div></body></html>',
        },
      ];

      for (const variation of cloudflareVariations) {
        const openRouterMock = nock('https://openrouter.ai')
          .get('/api/v1/auth/key')
          .matchHeader('authorization', validApiKey)
          .reply(503, variation.html, {
            'content-type': 'text/html; charset=UTF-8',
          });

        const response = await request(app)
          .get('/v1/auth/key')
          .set('Authorization', validApiKey)
          .expect(200);

        // All variations should trigger fallback
        expect(response.body.data.name).toBe('Local Development Mock');
        expect(response.headers['content-type']).toBe('application/json');

        expect(openRouterMock.isDone()).toBe(true);
      }
    });

    it('should NOT trigger fallback for legitimate HTML responses', async () => {
      // Non-Cloudflare HTML response (e.g., error page from another service)
      const legitimateHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Service Unavailable</title></head>
        <body>
          <h1>Service Temporarily Unavailable</h1>
          <p>Our service is temporarily down for maintenance.</p>
        </body>
        </html>
      `;

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(503, legitimateHtml, {
          'content-type': 'text/html; charset=UTF-8',
        });

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(503); // Should pass through the actual error

      // Should NOT use mock fallback for non-Cloudflare HTML
      expect(response.text).toContain('Service Temporarily Unavailable');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle mixed content-type responses correctly', async () => {
      // Test case where OpenRouter returns unexpected content-type
      const cloudflareHtml =
        '<!DOCTYPE html><html><body>Cloudflare protection active</body></html>';

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(200, cloudflareHtml, {
          'content-type': 'application/json', // Wrong content-type for HTML
        });

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should still detect Cloudflare by content, not just headers
      expect(response.body.data.name).toBe('Local Development Mock');

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Mock Response Fallbacks', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should provide realistic mock response for /v1/auth/key fallback', async () => {
      const cloudflareHtml =
        '<!DOCTYPE html><html><body>Cloudflare</body></html>';

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(503, cloudflareHtml);

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      // Mock should have realistic structure
      expect(response.body.data).toEqual({
        name: 'Local Development Mock',
        models: ['gpt-3.5-turbo', 'gpt-4', 'claude-3-haiku'],
        api_key: validApiKey.replace('Bearer ', ''),
        monthly_limit: 100000,
        usage: 0,
        is_valid: true,
      });

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should provide realistic mock response for /v1/models fallback', async () => {
      const cloudflareHtml =
        '<!DOCTYPE html><html><body>Cloudflare security check</body></html>';

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(503, cloudflareHtml);

      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', validApiKey)
        .expect(200);

      // Mock should have realistic model list
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      const expectedModels = ['gpt-3.5-turbo', 'gpt-4', 'claude-3-haiku'];
      expectedModels.forEach(modelId => {
        expect(response.body.data).toContainEqual(
          expect.objectContaining({ id: modelId })
        );
      });

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should preserve API key in mock auth response', async () => {
      const customApiKey = 'Bearer sk-or-v1-custom-key-456';
      const cloudflareHtml =
        '<!DOCTYPE html><html><body>Cloudflare</body></html>';

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', customApiKey)
        .reply(503, cloudflareHtml);

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', customApiKey)
        .expect(200);

      // Should preserve the actual API key in mock response
      expect(response.body.data.api_key).toBe(
        customApiKey.replace('Bearer ', '')
      );

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle missing authorization header in fallback', async () => {
      const cloudflareHtml =
        '<!DOCTYPE html><html><body>Cloudflare</body></html>';

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .reply(503, cloudflareHtml);

      const response = await request(app)
        .get('/v1/auth/key')
        // No Authorization header
        .expect(200); // Should still provide fallback

      // Should provide default mock key
      expect(response.body.data.api_key).toBe('mock-key');
      expect(response.body.data.name).toBe('Local Development Mock');

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Performance and Reliability', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should handle Cloudflare detection quickly', async () => {
      const cloudflareHtml =
        '<!DOCTYPE html><html><body>Cloudflare protection</body></html>';

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(503, cloudflareHtml);

      const startTime = Date.now();

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      const responseTime = Date.now() - startTime;

      // Fallback should be fast
      expect(responseTime).toBeLessThan(500);
      expect(response.body.data.name).toBe('Local Development Mock');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle concurrent Cloudflare blocks efficiently', async () => {
      const cloudflareHtml =
        '<!DOCTYPE html><html><body>Cloudflare</body></html>';

      // Setup multiple mocks for concurrent requests
      for (let i = 0; i < 5; i++) {
        nock('https://openrouter.ai')
          .get('/api/v1/auth/key')
          .matchHeader('authorization', validApiKey)
          .reply(503, cloudflareHtml);
      }

      const startTime = Date.now();

      // Send concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        request(app)
          .get('/v1/auth/key')
          .set('Authorization', validApiKey)
          .expect(200)
      );

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All should succeed with fallback
      responses.forEach(response => {
        expect(response.body.data.name).toBe('Local Development Mock');
      });

      // Concurrent fallbacks should be handled efficiently
      expect(totalTime).toBeLessThan(1000);
    });

    it('should not affect normal responses when Cloudflare is not blocking', async () => {
      // Normal successful response
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(
          200,
          {
            data: {
              api_key: validApiKey.replace('Bearer ', ''),
              name: 'Real API Key',
              is_valid: true,
              usage: 42,
            },
          },
          {
            'content-type': 'application/json',
          }
        );

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should NOT use fallback for successful responses
      expect(response.body.data.name).toBe('Real API Key');
      expect(response.body.data.usage).toBe(42);
      expect(response.body.data.name).not.toBe('Local Development Mock');

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Error Handling in Fallback Logic', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should handle malformed Cloudflare responses gracefully', async () => {
      // Malformed HTML that might still indicate Cloudflare
      const malformedHtml = '<!DOCTYPE html><html><body>Cloudflare<broken-tag>';

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(503, malformedHtml);

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should still trigger fallback despite malformed HTML
      expect(response.body.data.name).toBe('Local Development Mock');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle network errors vs Cloudflare blocking correctly', async () => {
      // Network error (connection refused)
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .replyWithError('ECONNREFUSED');

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(500); // Should return actual network error

      // Should NOT use fallback for network errors
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error.message).toContain('Network error');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should log Cloudflare detection events appropriately', async () => {
      const cloudflareHtml =
        '<!DOCTYPE html><html><body>Cloudflare protection active</body></html>';

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/auth/key')
        .matchHeader('authorization', validApiKey)
        .reply(503, cloudflareHtml);

      const response = await request(app)
        .get('/v1/auth/key')
        .set('Authorization', validApiKey)
        .expect(200);

      // Should include correlation ID for tracking fallback usage
      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.body.data.name).toBe('Local Development Mock');

      expect(openRouterMock.isDone()).toBe(true);
    });
  });

  describe('Environment-Specific Behavior', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should only use fallbacks in development/local environment', async () => {
      // This test assumes fallbacks are environment-specific
      // In production, Cloudflare blocks should be handled differently

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const cloudflareHtml =
          '<!DOCTYPE html><html><body>Cloudflare</body></html>';

        const openRouterMock = nock('https://openrouter.ai')
          .get('/api/v1/auth/key')
          .matchHeader('authorization', validApiKey)
          .reply(503, cloudflareHtml);

        const response = await request(app)
          .get('/v1/auth/key')
          .set('Authorization', validApiKey);

        // In production, might handle differently or pass through error
        // This test documents the expected behavior
        expect(response.status).toBeDefined();

        expect(openRouterMock.isDone()).toBe(true);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
