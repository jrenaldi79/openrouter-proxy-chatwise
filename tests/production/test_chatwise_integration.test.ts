import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';

describe('ChatWise Integration Pattern - Real API Tests', () => {
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

  describe('ChatWise Dual API Call Pattern', () => {
    const validApiKey = `Bearer ${process.env.OPENROUTER_TEST_API_KEY}`;

    testIf(hasRealApiKey)(
      'should handle ChatWise dual endpoint calls (/v1/credits + /v1/auth/key)',
      async () => {
        // Action: Simulate ChatWise calling both endpoints concurrently
        const [creditsResponse, authResponse] = await Promise.all([
          request(app).get('/v1/credits').set('Authorization', validApiKey),
          request(app).get('/v1/auth/key').set('Authorization', validApiKey),
        ]);

        // Verification: Credits endpoint should work (transformed from /api/v1/key)
        expect(creditsResponse.status).toBe(200);
        expect(creditsResponse.body.data).toHaveProperty('total_credits');
        expect(creditsResponse.body.data).toHaveProperty('total_usage');
        expect(typeof creditsResponse.body.data.total_credits).toBe('number');
        expect(typeof creditsResponse.body.data.total_usage).toBe('number');

        // Verification: Auth key endpoint should work (passthrough)
        expect(authResponse.status).toBe(200);
        expect(authResponse.body.data).toHaveProperty('label');
        expect(authResponse.body.data).toHaveProperty('limit');
        expect(authResponse.body.data).toHaveProperty('usage');

        // Both should have proper headers for ChatWise validation
        expect(creditsResponse.headers['content-type']).toMatch(
          /^application\/json/
        );
        expect(authResponse.headers['content-type']).toMatch(
          /^application\/json/
        );
        expect(creditsResponse.headers['x-correlation-id']).toBeDefined();
        expect(authResponse.headers['x-correlation-id']).toBeDefined();
      },
      15000
    );

    testIf(hasRealApiKey)(
      'should handle ChatWise models endpoint',
      async () => {
        const response = await request(app)
          .get('/v1/models')
          .set('Authorization', validApiKey);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThan(0);

        // Each model should have basic structure
        const firstModel = response.body.data[0];
        expect(firstModel).toHaveProperty('id');
        expect(firstModel).toHaveProperty('name');

        // Headers should be compatible with ChatWise validation
        expect(response.headers['content-type']).toMatch(/^application\/json/);
        expect(response.headers['x-correlation-id']).toBeDefined();
      },
      15000
    );

    testIf(hasRealApiKey)(
      'should handle ChatWise chat completion request',
      async () => {
        const response = await request(app)
          .post('/v1/chat/completions')
          .set('Authorization', validApiKey)
          .send({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'user',
                content: 'Say "Hello ChatWise" and nothing else.',
              },
            ],
            max_tokens: 10,
            stream: false,
          });

        // May get 200 with completion or error status due to API limits
        if (response.status === 200) {
          expect(response.body).toHaveProperty('id');
          expect(response.body).toHaveProperty('choices');
          expect(response.body.choices).toBeInstanceOf(Array);
        } else {
          // Should get proper error response structure
          expect(response.body).toHaveProperty('error');
        }

        expect(response.headers['content-type']).toMatch(/^application\/json/);
        expect(response.headers['x-correlation-id']).toBeDefined();
      },
      20000
    );

    testIf(hasRealApiKey)(
      'should maintain reasonable response times for ChatWise',
      async () => {
        const startTime = Date.now();

        await request(app)
          .get('/v1/credits')
          .set('Authorization', validApiKey)
          .expect(200);

        const responseTime = Date.now() - startTime;

        // ChatWise expects reasonable response times
        expect(responseTime).toBeLessThan(5000); // Under 5 seconds
      },
      10000
    );

    testIf(hasRealApiKey)(
      'should handle ChatWise error scenarios gracefully',
      async () => {
        const invalidApiKey = 'Bearer sk-or-v1-invalid-key-12345';

        const response = await request(app)
          .get('/v1/credits')
          .set('Authorization', invalidApiKey)
          .expect(401);

        // Should get proper error response for ChatWise
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.headers['x-correlation-id']).toBeDefined();
      },
      10000
    );

    test('should skip ChatWise integration tests when no API key is available', () => {
      if (!hasRealApiKey) {
        console.log(
          'Skipping ChatWise integration tests - no OPENROUTER_TEST_API_KEY found'
        );
        expect(true).toBe(true); // Placeholder assertion
      }
    });
  });

  describe('ChatWise Performance Requirements', () => {
    const validApiKey = `Bearer ${process.env.OPENROUTER_TEST_API_KEY}`;

    testIf(hasRealApiKey)(
      'should handle ChatWise concurrent requests efficiently',
      async () => {
        const startTime = Date.now();

        // Simulate ChatWise making multiple concurrent requests
        const responses = await Promise.all([
          request(app).get('/v1/credits').set('Authorization', validApiKey),
          request(app).get('/v1/credits').set('Authorization', validApiKey),
          request(app).get('/v1/credits').set('Authorization', validApiKey),
        ]);

        const totalTime = Date.now() - startTime;

        // All requests should succeed
        responses.forEach(response => {
          expect(response.status).toBe(200);
          expect(response.body.data).toHaveProperty('total_credits');
        });

        // Concurrent processing should be efficient
        expect(totalTime).toBeLessThan(8000); // Under 8 seconds for 3 requests
      },
      15000
    );
  });
});
