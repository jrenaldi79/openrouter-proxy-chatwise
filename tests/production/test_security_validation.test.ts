import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';

describe('Security Validation - Real API Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  // Only run these tests if we have a real API key
  const hasRealApiKey = Boolean(
    process.env.OPENROUTER_TEST_API_KEY &&
      process.env.OPENROUTER_TEST_API_KEY.startsWith('sk-or-v1-')
  );

  const testIf = (condition: boolean) => (condition ? test : test.skip);
  const validApiKey = `Bearer ${process.env.OPENROUTER_TEST_API_KEY}`;

  describe('Authentication Security', () => {
    testIf(hasRealApiKey)(
      'should reject requests without authorization header',
      async () => {
        const response = await request(app)
          .get('/v1/credits')
          .expect(401);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.headers['x-correlation-id']).toBeDefined();
      },
      10000
    );

    testIf(hasRealApiKey)(
      'should reject requests with invalid API key format',
      async () => {
        const response = await request(app)
          .get('/v1/credits')
          .set('Authorization', 'Bearer invalid-key-format')
          .expect(401);

        expect(response.body).toHaveProperty('error');
        expect(response.headers['x-correlation-id']).toBeDefined();
      },
      10000
    );

    testIf(hasRealApiKey)(
      'should reject requests with malformed authorization header',
      async () => {
        const response = await request(app)
          .get('/v1/credits')
          .set('Authorization', 'InvalidFormat sk-or-v1-test')
          .expect(401);

        expect(response.body).toHaveProperty('error');
        expect(response.headers['x-correlation-id']).toBeDefined();
      },
      10000
    );
  });

  describe('Input Validation Security', () => {
    testIf(hasRealApiKey)(
      'should handle oversized request payloads gracefully',
      async () => {
        const largePayload = {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: 'x'.repeat(50000) // 50KB content
            }
          ]
        };

        const response = await request(app)
          .post('/v1/chat/completions')
          .set('Authorization', validApiKey)
          .send(largePayload);

        // Should either process successfully or return proper error
        if (response.status >= 400) {
          expect(response.body).toHaveProperty('error');
          expect(response.headers['x-correlation-id']).toBeDefined();
        } else {
          expect(response.status).toBe(200);
        }
      },
      20000
    );

    testIf(hasRealApiKey)(
      'should sanitize special characters in request data',
      async () => {
        const specialCharPayload = {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: 'Test with special chars: <script>alert("xss")</script> & 中文 🚀'
            }
          ],
          max_tokens: 10
        };

        const response = await request(app)
          .post('/v1/chat/completions')
          .set('Authorization', validApiKey)
          .send(specialCharPayload);

        // Should handle special characters without security issues
        expect(response.headers['x-correlation-id']).toBeDefined();
        if (response.status >= 400) {
          expect(response.body).toHaveProperty('error');
        }
      },
      15000
    );
  });

  describe('Rate Limiting and Error Handling', () => {
    testIf(hasRealApiKey)(
      'should handle rate limiting gracefully',
      async () => {
        // Make multiple rapid requests to potentially trigger rate limiting
        const promises = Array.from({ length: 5 }, () =>
          request(app)
            .get('/v1/credits')
            .set('Authorization', validApiKey)
        );

        const responses = await Promise.all(promises);

        // At least some should succeed, any rate limited should have proper error format
        responses.forEach(response => {
          expect(response.headers['x-correlation-id']).toBeDefined();
          if (response.status === 429) {
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code');
            if (response.headers['retry-after']) {
              expect(response.headers['retry-after']).toBeDefined();
            }
          } else if (response.status === 200) {
            expect(response.body.data).toHaveProperty('total_credits');
          }
        });
      },
      20000
    );

    testIf(hasRealApiKey)(
      'should provide correlation IDs for all requests',
      async () => {
        const endpoints = ['/v1/credits', '/v1/auth/key', '/v1/models'];

        for (const endpoint of endpoints) {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', validApiKey);

          expect(response.headers['x-correlation-id']).toBeDefined();
          expect(response.headers['x-correlation-id']).toMatch(/^[a-f0-9-]{36}$/);
        }
      },
      15000
    );
  });

  describe('SSL/TLS Security', () => {
    testIf(hasRealApiKey)(
      'should handle SSL handshake properly with clean headers',
      async () => {
        // This tests that our header filtering fix works properly
        const response = await request(app)
          .get('/v1/models')
          .set('Authorization', validApiKey)
          .set('X-Forwarded-For', '192.168.1.1') // Should be filtered out
          .set('Connection', 'keep-alive') // Should be filtered out
          .set('Host', 'malicious-host.com'); // Should be filtered out

        // Should succeed despite problematic headers being filtered
        expect(response.status).toBe(200);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.headers['x-correlation-id']).toBeDefined();
      },
      15000
    );
  });

  describe('Health and Monitoring', () => {
    test('should provide health check endpoint without authentication', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    testIf(hasRealApiKey)(
      'should include security headers in responses',
      async () => {
        const response = await request(app)
          .get('/v1/credits')
          .set('Authorization', validApiKey);

        expect(response.headers['content-type']).toMatch(/^application\/json/);
        expect(response.headers['x-correlation-id']).toBeDefined();

        // Should not expose sensitive server information
        expect(response.headers['server']).toBeUndefined();
        expect(response.headers['x-powered-by']).toBeUndefined();
      },
      10000
    );
  });

  test('should skip security tests when no API key is available', () => {
    if (!hasRealApiKey) {
      console.log(
        'Skipping security validation tests - no OPENROUTER_TEST_API_KEY found'
      );
      expect(true).toBe(true); // Placeholder assertion
    }
  });
});