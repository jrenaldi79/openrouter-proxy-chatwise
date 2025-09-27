import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';

describe('Real API Performance Tests', () => {
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

  describe('Response Time Performance', () => {
    testIf(hasRealApiKey)(
      'should handle /v1/credits requests within acceptable time limits',
      async () => {
        const startTime = Date.now();

        const response = await request(app)
          .get('/v1/credits')
          .set('Authorization', validApiKey)
          .expect(200);

        const responseTime = Date.now() - startTime;

        expect(response.body.data).toHaveProperty('total_credits');
        expect(response.body.data).toHaveProperty('total_usage');
        expect(responseTime).toBeLessThan(3000); // Under 3 seconds

        console.log(`Credits endpoint response time: ${responseTime}ms`);
      },
      10000
    );

    testIf(hasRealApiKey)(
      'should handle /v1/models requests within acceptable time limits',
      async () => {
        const startTime = Date.now();

        const response = await request(app)
          .get('/v1/models')
          .set('Authorization', validApiKey)
          .expect(200);

        const responseTime = Date.now() - startTime;

        expect(response.body.data).toBeInstanceOf(Array);
        expect(responseTime).toBeLessThan(5000); // Under 5 seconds

        console.log(`Models endpoint response time: ${responseTime}ms`);
      },
      10000
    );

    testIf(hasRealApiKey)(
      'should handle /v1/auth/key requests within acceptable time limits',
      async () => {
        const startTime = Date.now();

        const response = await request(app)
          .get('/v1/auth/key')
          .set('Authorization', validApiKey)
          .expect(200);

        const responseTime = Date.now() - startTime;

        expect(response.body.data).toHaveProperty('label');
        expect(responseTime).toBeLessThan(3000); // Under 3 seconds

        console.log(`Auth key endpoint response time: ${responseTime}ms`);
      },
      10000
    );
  });

  describe('Concurrent Request Performance', () => {
    testIf(hasRealApiKey)(
      'should handle concurrent /v1/credits requests efficiently',
      async () => {
        const concurrentRequests = 3; // Small number to avoid rate limiting
        const startTime = Date.now();

        // Execute concurrent requests
        const promises = Array.from({ length: concurrentRequests }, () =>
          request(app).get('/v1/credits').set('Authorization', validApiKey)
        );

        const responses = await Promise.all(promises);
        const totalTime = Date.now() - startTime;

        // All requests should succeed
        responses.forEach(response => {
          expect(response.status).toBe(200);
          expect(response.body.data).toHaveProperty('total_credits');
        });

        // Should handle concurrent requests efficiently
        expect(totalTime).toBeLessThan(8000); // Under 8 seconds for 3 concurrent requests

        console.log(
          `${concurrentRequests} concurrent requests completed in: ${totalTime}ms`
        );
        console.log(`Average per request: ${totalTime / concurrentRequests}ms`);
      },
      15000
    );

    testIf(hasRealApiKey)(
      'should handle ChatWise dual endpoint pattern efficiently',
      async () => {
        const startTime = Date.now();

        // Simulate ChatWise calling both endpoints concurrently
        const [creditsResponse, authResponse] = await Promise.all([
          request(app).get('/v1/credits').set('Authorization', validApiKey),
          request(app).get('/v1/auth/key').set('Authorization', validApiKey),
        ]);

        const totalTime = Date.now() - startTime;

        // Both should succeed
        expect(creditsResponse.status).toBe(200);
        expect(authResponse.status).toBe(200);

        // Should complete dual request pattern quickly
        expect(totalTime).toBeLessThan(6000); // Under 6 seconds for dual request

        console.log(
          `ChatWise dual endpoint pattern completed in: ${totalTime}ms`
        );
      },
      12000
    );
  });

  describe('Throughput Performance', () => {
    testIf(hasRealApiKey)(
      'should maintain reasonable throughput under sequential load',
      async () => {
        const requestCount = 5; // Small sequential load
        const results: number[] = [];

        console.log(
          `Testing sequential throughput with ${requestCount} requests...`
        );

        for (let i = 0; i < requestCount; i++) {
          const startTime = Date.now();

          const response = await request(app)
            .get('/v1/credits')
            .set('Authorization', validApiKey)
            .expect(200);

          const responseTime = Date.now() - startTime;
          results.push(responseTime);

          expect(response.body.data).toHaveProperty('total_credits');

          // Small delay to avoid aggressive rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const averageTime = results.reduce((a, b) => a + b, 0) / results.length;
        const maxTime = Math.max(...results);

        console.log(`Average response time: ${averageTime.toFixed(0)}ms`);
        console.log(`Max response time: ${maxTime}ms`);
        console.log(`Individual times: ${results.join('ms, ')}ms`);

        // Performance thresholds
        expect(averageTime).toBeLessThan(3000); // Average under 3 seconds
        expect(maxTime).toBeLessThan(5000); // No single request over 5 seconds
      },
      30000
    );
  });

  test('should skip performance tests when no API key is available', () => {
    if (!hasRealApiKey) {
      console.log(
        'Skipping real API performance tests - no OPENROUTER_TEST_API_KEY found'
      );
      expect(true).toBe(true); // Placeholder assertion
    }
  });
});
