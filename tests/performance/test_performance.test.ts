import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';
import { createApp } from '../../src/app';

describe('Performance Integration Tests', () => {
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

  describe('Credit Transformation Performance', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should maintain consistent performance under load', async () => {
      const concurrentRequests = 10;

      // Setup mocks for concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        nock('https://openrouter.ai')
          .get('/api/v1/key')
          .matchHeader('authorization', validApiKey)
          .reply(200, { data: { limit: 100, usage: i } });
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

  describe('Chat API Performance (Primary Concern)', () => {
    const validApiKey = 'Bearer sk-or-v1-test-key-123';

    it('should handle large chat requests efficiently', async () => {
      // Create a large chat request (simulating long conversations)
      const largeContent = 'x'.repeat(10000); // 10KB of content
      const largeChatRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: largeContent }],
        max_tokens: 1000,
        temperature: 0.7,
      };

      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', largeChatRequest)
        .matchHeader('authorization', validApiKey)
        .reply(200, {
          id: 'chat-large',
          choices: [{ message: { content: 'Response' } }]
        });

      const startTime = Date.now();
      await request(app)
        .post('/api/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send(largeChatRequest)
        .expect(200);

      const responseTime = Date.now() - startTime;

      // Chat API should handle large requests under 500ms
      expect(responseTime).toBeLessThan(500);
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle concurrent chat requests efficiently', async () => {
      const concurrentRequests = 20; // Simulate high chat load
      const chatRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      };

      // Setup mocks for concurrent chat requests
      for (let i = 0; i < concurrentRequests; i++) {
        nock('https://openrouter.ai')
          .post('/api/v1/chat/completions', chatRequest)
          .matchHeader('authorization', validApiKey)
          .reply(200, {
            id: `chat-${i}`,
            choices: [{ message: { content: `Response ${i}` } }]
          });
      }

      // Execute concurrent chat requests
      const startTime = Date.now();
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .post('/api/v1/chat/completions')
          .set('Authorization', validApiKey)
          .send(chatRequest)
      );

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      results.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
      });

      // High chat concurrency should complete under 2 seconds
      expect(totalTime).toBeLessThan(2000);
    });

    it('should handle streaming chat requests with minimal latency', async () => {
      const streamingChatRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Tell me a story' }],
        stream: true,
      };

      const openRouterMock = nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', streamingChatRequest)
        .matchHeader('authorization', validApiKey)
        .reply(200, 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n', {
          'content-type': 'text/plain',
        });

      const startTime = Date.now();
      const response = await request(app)
        .post('/api/v1/chat/completions')
        .set('Authorization', validApiKey)
        .send(streamingChatRequest);

      const responseTime = Date.now() - startTime;

      // Streaming should start very quickly
      expect(responseTime).toBeLessThan(200);
      expect(response.status).toBe(200);
      expect(openRouterMock.isDone()).toBe(true);
    });

    it('should handle varying chat request sizes consistently', async () => {
      const requestSizes = [
        { size: 100, description: 'small' },
        { size: 1000, description: 'medium' },
        { size: 5000, description: 'large' },
      ];

      const responseTimes = [];

      for (const { size, description } of requestSizes) {
        const chatRequest = {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'x'.repeat(size) }],
        };

        const openRouterMock = nock('https://openrouter.ai')
          .post('/api/v1/chat/completions', chatRequest)
          .matchHeader('authorization', validApiKey)
          .reply(200, { id: `chat-${description}` });

        const startTime = Date.now();
        await request(app)
          .post('/api/v1/chat/completions')
          .set('Authorization', validApiKey)
          .send(chatRequest)
          .expect(200);

        const responseTime = Date.now() - startTime;
        responseTimes.push({ size, responseTime, description });

        expect(openRouterMock.isDone()).toBe(true);
      }

      // All chat requests should complete reasonably quickly
      responseTimes.forEach(({ responseTime, description }) => {
        expect(responseTime).toBeLessThan(600); // 600ms max for any size
      });

      // Response time shouldn't degrade dramatically with size
      const maxTime = Math.max(...responseTimes.map(r => r.responseTime));
      const minTime = Math.min(...responseTimes.map(r => r.responseTime));
      expect(maxTime / minTime).toBeLessThan(3); // Max 3x difference
    });
  });
});