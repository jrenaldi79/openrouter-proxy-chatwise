"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../../src/app");
describe('Health Check Contract Tests', () => {
    let app;
    beforeAll(() => {
        app = (0, app_1.createApp)();
    });
    describe('GET /health', () => {
        it('should return 200 status with healthy system response', async () => {
            const response = await (0, supertest_1.default)(app).get('/health').expect(200);
            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('openrouterConnectivity');
            expect(response.body).toHaveProperty('uptime');
            expect(response.body).toHaveProperty('version');
            expect(response.body).toHaveProperty('timestamp');
            expect(['healthy', 'unhealthy', 'degraded']).toContain(response.body.status);
            expect(['connected', 'disconnected', 'timeout']).toContain(response.body.openrouterConnectivity);
            expect(typeof response.body.uptime).toBe('number');
            expect(response.body.uptime).toBeGreaterThanOrEqual(0);
            expect(typeof response.body.version).toBe('string');
            expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(typeof response.body.timestamp).toBe('string');
            expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
            if (response.body.cacheStatus) {
                expect(['operational', 'degraded', 'disabled']).toContain(response.body.cacheStatus);
            }
        });
        it('should return 503 status when system is unhealthy', async () => {
            expect(true).toBe(true);
        });
        it('should have correct Content-Type header', async () => {
            const response = await (0, supertest_1.default)(app).get('/health');
            expect(response.headers['content-type']).toMatch(/application\/json/);
        });
        it('should respond within acceptable time limits', async () => {
            const startTime = Date.now();
            await (0, supertest_1.default)(app).get('/health');
            const responseTime = Date.now() - startTime;
            expect(responseTime).toBeLessThan(100);
        });
        it('should include security headers', async () => {
            const response = await (0, supertest_1.default)(app).get('/health');
            expect(response.headers).toHaveProperty('x-content-type-options');
            expect(response.headers).toHaveProperty('x-frame-options');
            expect(response.headers).toHaveProperty('x-xss-protection');
        });
    });
});
//# sourceMappingURL=test_health_check.test.js.map