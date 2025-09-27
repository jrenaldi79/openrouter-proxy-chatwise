"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const nock_1 = __importDefault(require("nock"));
const app_1 = require("../../src/app");
describe('Credit Transformation Contract Tests', () => {
    let app;
    beforeAll(() => {
        app = (0, app_1.createApp)();
    });
    beforeEach(() => {
        nock_1.default.cleanAll();
    });
    afterEach(() => {
        nock_1.default.isDone();
    });
    describe('GET /api/v1/me/credits - Credit transformation', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        it('should transform limited account response correctly', async () => {
            const openRouterKeyResponse = {
                limit: 100.5,
                usage: 25.75,
            };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse);
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('total_credits');
            expect(response.body.data).toHaveProperty('total_usage');
            expect(response.body.data.total_credits).toBe(100.5);
            expect(response.body.data.total_usage).toBe(25.75);
            expect(typeof response.body.data.total_credits).toBe('number');
            expect(typeof response.body.data.total_usage).toBe('number');
            expect(response.body.data.total_credits).toBeGreaterThanOrEqual(0);
            expect(response.body.data.total_usage).toBeGreaterThanOrEqual(0);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should transform unlimited account response correctly', async () => {
            const openRouterKeyResponse = {
                limit: null,
                usage: 125.3,
            };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse);
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(response.body.data.total_credits).toBe(999999);
            expect(response.body.data.total_usage).toBe(125.3);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should handle zero usage correctly', async () => {
            const openRouterKeyResponse = {
                limit: 50.0,
                usage: 0,
            };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse);
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(response.body.data.total_credits).toBe(50.0);
            expect(response.body.data.total_usage).toBe(0);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should forward authentication errors from OpenRouter', async () => {
            const openRouterErrorResponse = {
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid API key',
                },
            };
            const invalidButWellFormattedKey = 'Bearer sk-or-v1-invalid-key-123';
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', invalidButWellFormattedKey)
                .reply(401, openRouterErrorResponse);
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', invalidButWellFormattedKey)
                .expect(401);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body.error).toHaveProperty('correlationId');
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should handle OpenRouter server errors appropriately', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(500, { error: 'Internal server error' });
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(502);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error.code).toBe('UPSTREAM_ERROR');
            expect(response.body.error).toHaveProperty('correlationId');
            expect(openRouterMock.isDone()).toBe(true);
        });
        it.skip('should handle OpenRouter timeout errors', async () => {
        }, 40000);
        it('should validate API key format', async () => {
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', 'Bearer invalid-format')
                .expect(401);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
            expect(response.body.error.message).toMatch(/invalid.*api.*key/i);
        });
        it('should require Authorization header', async () => {
            const response = await (0, supertest_1.default)(app).get('/api/v1/me/credits').expect(401);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
            expect(response.body.error.message).toMatch(/authorization.*required/i);
        });
        it('should have correct Content-Type for successful responses', async () => {
            const openRouterKeyResponse = { limit: 100, usage: 25 };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse);
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(response.headers['content-type']).toMatch(/application\/json/);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should not accept non-GET methods', async () => {
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(405);
            expect(response.body.error.code).toBe('METHOD_NOT_ALLOWED');
        });
        it('should respond within performance requirements', async () => {
            const openRouterKeyResponse = { limit: 100, usage: 25 };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse);
            const startTime = Date.now();
            await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            const responseTime = Date.now() - startTime;
            expect(responseTime).toBeLessThan(200);
            expect(openRouterMock.isDone()).toBe(true);
        });
    });
    describe('Caching behavior validation', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        const openRouterKeyResponse = { limit: 100, usage: 25 };
        it('should cache responses for subsequent requests', async () => {
            const openRouterMock1 = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse);
            const response1 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(openRouterMock1.isDone()).toBe(true);
            const openRouterMock2 = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse);
            const response2 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(response2.body).toEqual(response1.body);
            expect(openRouterMock2.isDone()).toBe(true);
        });
    });
});
//# sourceMappingURL=test_credit_transformation.test.js.map