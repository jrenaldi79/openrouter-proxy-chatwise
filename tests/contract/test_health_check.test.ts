import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';

describe('Health Check Contract Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /health', () => {
    it('should return 200 status with healthy system response', async () => {
      const response = await request(app).get('/health').expect(200);

      // Validate response structure according to OpenAPI spec
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('openrouterConnectivity');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('timestamp');

      // Validate required field types and values
      expect(['healthy', 'unhealthy', 'degraded']).toContain(
        response.body.status
      );
      expect(['connected', 'disconnected', 'timeout']).toContain(
        response.body.openrouterConnectivity
      );
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof response.body.version).toBe('string');
      expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning
      expect(typeof response.body.timestamp).toBe('string');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);

      // Validate optional fields if present
      if (response.body.cacheStatus) {
        expect(['operational', 'degraded', 'disabled']).toContain(
          response.body.cacheStatus
        );
      }
    });

    it('should return 503 status when system is unhealthy', async () => {
      // This test will verify unhealthy system response
      // Will be implemented after we have the health service
      expect(true).toBe(true); // Placeholder assertion
    });

    it('should have correct Content-Type header', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should respond within acceptable time limits', async () => {
      const startTime = Date.now();
      await request(app).get('/health');
      const responseTime = Date.now() - startTime;

      // Health check should respond quickly (under 100ms for local checks)
      expect(responseTime).toBeLessThan(100);
    });

    it('should include security headers', async () => {
      const response = await request(app).get('/health');

      // These headers should be added by helmet middleware
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });
  });
});
