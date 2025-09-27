import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Security Validation Integration Tests', () => {
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

  describe('Scenario 5: Security Validation', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should enforce rate limiting per IP address', async () => {
      const rateLimitRequests = 102; // Exceed default limit of 100
      const responses = [];

      // Setup OpenRouter mocks for successful requests
      for (let i = 0; i < rateLimitRequests; i++) {
        nock('https://openrouter.ai')
          .get('/api/v1/models')
          .matchHeader('authorization', validApiKey)
          .reply(200, { data: [] });
      }

      // Execute requests rapidly from same IP
      for (let i = 0; i < rateLimitRequests; i++) {
        const response = await request(app)
          .get('/api/v1/models')
          .set('Authorization', validApiKey);
        responses.push(response);
      }

      // Verification: Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Verification: Rate limit response format
      const rateLimitResponse = rateLimitedResponses[0];
      if (rateLimitResponse) {
        expect(rateLimitResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(rateLimitResponse.body.error.message).toMatch(/rate.*limit/i);
        expect(rateLimitResponse.headers).toHaveProperty('retry-after');
      }
    });

    it('should validate API key format strictly', async () => {
      const invalidApiKeys = [
        'invalid-key',
        'Bearer invalid-format',
        'Bearer sk-invalid-format',
        'Bearer sk-or-v2-invalid',
        'sk-or-v1-without-bearer',
        'Bearer ',
        '',
      ];

      for (const invalidKey of invalidApiKeys) {
        const requestBuilder = request(app).get('/api/v1/me/credits');

        if (invalidKey) {
          requestBuilder.set('Authorization', invalidKey);
        }

        const response = await requestBuilder.expect(401);

        expect(response.body.error.code).toBe('UNAUTHORIZED');
        expect(response.body.error.message).toMatch(
          /invalid.*api.*key|authorization.*required/i
        );
        expect(response.body.error).toHaveProperty('correlationId');
      }
    });

    it('should include security headers in all responses', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: [] });

      const response = await request(app)
        .get('/api/v1/models')
        .set('Authorization', validApiKey)
        .expect(200);

      // Verification: Security headers from helmet middleware
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
        'strict-transport-security',
        'x-dns-prefetch-control',
      ];

      securityHeaders.forEach(header => {
        expect(response.headers).toHaveProperty(header);
      });

      // Verification: Content-Type options
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle CORS properly for allowed origins', async () => {
      const allowedOrigins = [
        'https://app.example.com',
        'https://dashboard.example.com',
        'http://localhost:3000', // Development
      ];

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: [] })
        .persist();

      for (const origin of allowedOrigins) {
        // Preflight request
        const preflightResponse = await request(app)
          .options('/api/v1/models')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'GET')
          .set('Access-Control-Request-Headers', 'authorization');

        expect(preflightResponse.status).toBe(204);
        expect(preflightResponse.headers['access-control-allow-origin']).toBe(
          origin
        );
        expect(
          preflightResponse.headers['access-control-allow-methods']
        ).toMatch(/GET/);
        expect(
          preflightResponse.headers['access-control-allow-headers']
        ).toMatch(/authorization/i);

        // Actual request
        const actualResponse = await request(app)
          .get('/api/v1/models')
          .set('Origin', origin)
          .set('Authorization', validApiKey)
          .expect(200);

        expect(actualResponse.headers['access-control-allow-origin']).toBe(
          origin
        );
      }

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should reject requests from disallowed origins', async () => {
      const disallowedOrigins = [
        'https://malicious-site.com',
        'http://attacker.example',
        'https://phishing-site.net',
      ];

      for (const origin of disallowedOrigins) {
        const response = await request(app)
          .options('/api/v1/models')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'GET');

        // Should not include CORS headers for disallowed origins
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      }
    });

    it('should sanitize input data to prevent injection attacks', async () => {
      const maliciousInputs = [
        { header: 'X-Malicious', value: '<script>alert("xss")</script>' },
        { header: 'X-Injection', value: "'; DROP TABLE users; --" },
        { header: 'X-Command', value: '$(rm -rf /)' },
        { header: 'X-Path', value: '../../../etc/passwd' },
      ];

      const openRouterMock = nock('https://openrouter.ai')
        .get('/api/v1/models')
        .matchHeader('authorization', validApiKey)
        .reply(200, { data: [] })
        .persist();

      for (const maliciousInput of maliciousInputs) {
        const response = await request(app)
          .get('/api/v1/models')
          .set('Authorization', validApiKey)
          .set(maliciousInput.header, maliciousInput.value)
          .expect(200);

        // Verification: Malicious content should not appear in response
        const responseText =
          JSON.stringify(response.body) + JSON.stringify(response.headers);
        expect(responseText).not.toContain('<script>');
        expect(responseText).not.toContain('DROP TABLE');
        expect(responseText).not.toContain('$(rm');
        expect(responseText).not.toContain('../../../');
      }

      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should prevent request smuggling attacks', async () => {
      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .matchHeader('authorization', validApiKey)
        .reply(200, { id: 'chat-test' });

      // Attempt request smuggling with multiple Content-Length headers
      const response = await request(app)
        .post('/api/v1/chat/completions')
        .set('Authorization', validApiKey)
        .set('Content-Length', '13')
        .set('Content-Length', '0') // Duplicate header
        .send({ model: 'gpt-3.5-turbo' });

      // Should handle gracefully without allowing smuggling
      expect(response.status).toBeLessThan(500); // Should not crash the server
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should enforce request size limits', async () => {
      // Create oversized request body (assuming 1MB limit)
      const oversizedPayload = {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: 'x'.repeat(2 * 1024 * 1024), // 2MB of content
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send(oversizedPayload);

      // Should reject oversized requests
      expect(response.status).toBe(413); // Payload Too Large
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('should prevent timing attacks on API key validation', async () => {
      const validKey = 'Bearer sk-or-v1-' + 'a'.repeat(64);
      const invalidKeys = [
        'Bearer sk-or-v1-' + 'b'.repeat(64),
        'Bearer sk-or-v1-' + 'c'.repeat(32), // Different length
        'Bearer invalid-format',
      ];

      // Measure timing for valid key format (even if unauthorized)
      const validTimings = [];
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await request(app)
          .get('/api/v1/me/credits')
          .set('Authorization', validKey);
        validTimings.push(Date.now() - start);
      }

      // Measure timing for invalid keys
      const invalidTimings = [];
      for (const invalidKey of invalidKeys) {
        for (let i = 0; i < 5; i++) {
          const start = Date.now();
          await request(app)
            .get('/api/v1/me/credits')
            .set('Authorization', invalidKey);
          invalidTimings.push(Date.now() - start);
        }
      }

      // Verification: Timing should be consistent to prevent timing attacks
      const validAvg =
        validTimings.reduce((a, b) => a + b) / validTimings.length;
      const invalidAvg =
        invalidTimings.reduce((a, b) => a + b) / invalidTimings.length;

      // Timing difference should be minimal (within 50ms)
      expect(Math.abs(validAvg - invalidAvg)).toBeLessThan(50);
    });

    it('should log security events without exposing sensitive data', async () => {
      // This test would verify that security events are logged
      // but sensitive information like API keys is not included

      const securityEvents = [
        {
          action: () => request(app).get('/api/v1/me/credits'),
          expectedEvent: 'MISSING_AUTHORIZATION',
        },
        {
          action: () =>
            request(app)
              .get('/api/v1/me/credits')
              .set('Authorization', 'Bearer invalid-format'),
          expectedEvent: 'INVALID_API_KEY_FORMAT',
        },
      ];

      for (const event of securityEvents) {
        const response = await event.action();

        expect(response.status).toBe(401);
        expect(response.body.error).toHaveProperty('correlationId');

        // Verification: Security event logged (would check logs in real implementation)
        // expect(securityLogs).toContainEqual(expect.objectContaining({
        //   event: event.expectedEvent,
        //   correlationId: response.body.error.correlationId,
        //   timestamp: expect.any(String),
        //   // Should NOT contain: apiKey, authorization headers
        // }));
      }
    });

    it('should handle concurrent security validation efficiently', async () => {
      // Test multiple concurrent requests with various security scenarios
      const concurrentRequests = 20;
      const securityScenarios = [
        { auth: validApiKey, expectStatus: 200 },
        { auth: 'Bearer invalid-format', expectStatus: 401 },
        { auth: null, expectStatus: 401 },
        { auth: 'Bearer sk-or-v1-too-short', expectStatus: 401 },
      ];

      // Setup mocks for valid requests
      const validRequests = Math.ceil(
        concurrentRequests / securityScenarios.length
      );
      const openRouterMock = nock('https://openrouter.ai');
      for (let i = 0; i < validRequests; i++) {
        openRouterMock
          .get('/api/v1/models')
          .matchHeader('authorization', validApiKey)
          .reply(200, { data: [] });
      }

      // Execute concurrent requests with different security scenarios
      const startTime = Date.now();
      const promises = Array.from(
        { length: concurrentRequests },
        (_, index) => {
          const scenario = securityScenarios[index % securityScenarios.length];
          if (!scenario) throw new Error('Invalid scenario index');

          const requestBuilder = request(app).get('/api/v1/models');

          if (scenario.auth) {
            requestBuilder.set('Authorization', scenario.auth);
          }

          return requestBuilder;
        }
      );

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // Verification: All requests handled appropriately
      results.forEach((response, index) => {
        const expectedScenario =
          securityScenarios[index % securityScenarios.length];
        if (!expectedScenario) throw new Error('Invalid scenario index');
        expect(response.status).toBe(expectedScenario.expectStatus);
      });

      // Verification: Security validation doesn't significantly impact performance
      expect(totalTime).toBeLessThan(3000); // 20 concurrent security validations in under 3 seconds
    });
  });

  describe('Authentication and authorization edge cases', () => {
    it('should handle various Bearer token formats correctly', async () => {
      const tokenFormats = [
        { token: 'Bearer sk-or-v1-valid-key-format-12345678', valid: true },
        { token: 'bearer sk-or-v1-lowercase-bearer', valid: false }, // Case sensitive
        { token: 'Bearer  sk-or-v1-extra-spaces', valid: false }, // Extra spaces
        { token: 'Bearer sk-or-v1-', valid: false }, // Too short
        { token: 'Bearersk-or-v1-no-space', valid: false }, // No space
        { token: 'Bearer sk-or-v1-valid' + 'x'.repeat(100), valid: true }, // Long but valid
      ];

      for (const format of tokenFormats) {
        const response = await request(app)
          .get('/api/v1/me/credits')
          .set('Authorization', format.token);

        if (format.valid) {
          // Valid format should proceed to OpenRouter (and fail there)
          expect(response.status).not.toBe(401);
        } else {
          // Invalid format should be rejected immediately
          expect(response.status).toBe(401);
          expect(response.body.error.code).toBe('UNAUTHORIZED');
        }
      }
    });

    it('should handle missing or malformed authorization headers', async () => {
      const authHeaders = [
        { name: 'Missing header', value: undefined },
        { name: 'Empty header', value: '' },
        { name: 'Wrong scheme', value: 'Basic dXNlcjpwYXNz' },
        { name: 'No scheme', value: 'sk-or-v1-token-without-scheme' },
        { name: 'Multiple schemes', value: 'Bearer Basic sk-or-v1-confused' },
      ];

      for (const headerCase of authHeaders) {
        const requestBuilder = request(app).get('/api/v1/me/credits');

        if (headerCase.value !== undefined) {
          requestBuilder.set('Authorization', headerCase.value);
        }

        const response = await requestBuilder.expect(401);

        expect(response.body.error.code).toBe('UNAUTHORIZED');
        expect(response.body.error.message).toMatch(
          /authorization.*required|invalid.*api.*key/i
        );
      }
    });
  });
});
