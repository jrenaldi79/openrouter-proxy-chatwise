"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const nock_1 = __importDefault(require("nock"));
const app_1 = require("../../src/app");
describe('Error Propagation Integration Tests', () => {
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
    describe('Scenario 4: Error Propagation', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        it('should propagate OpenRouter authentication errors correctly', async () => {
            const openRouterErrorResponse = {
                error: {
                    message: 'Invalid API key provided',
                    type: 'authentication_error',
                    code: 'invalid_api_key',
                },
            };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', 'Bearer invalid-key')
                .reply(401, openRouterErrorResponse);
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/models')
                .set('Authorization', 'Bearer invalid-key')
                .expect(401);
            expect(response.body).toEqual(openRouterErrorResponse);
            expect(response.headers).toHaveProperty('x-correlation-id');
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should map OpenRouter server errors to appropriate status codes', async () => {
            const testCases = [
                {
                    openRouterStatus: 400,
                    expectedStatus: 400,
                    errorType: 'BAD_REQUEST',
                },
                {
                    openRouterStatus: 429,
                    expectedStatus: 429,
                    errorType: 'RATE_LIMIT_EXCEEDED',
                },
                {
                    openRouterStatus: 500,
                    expectedStatus: 502,
                    errorType: 'UPSTREAM_ERROR',
                },
                {
                    openRouterStatus: 502,
                    expectedStatus: 502,
                    errorType: 'UPSTREAM_ERROR',
                },
                {
                    openRouterStatus: 503,
                    expectedStatus: 502,
                    errorType: 'UPSTREAM_ERROR',
                },
            ];
            for (const testCase of testCases) {
                const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                    .get('/api/v1/models')
                    .matchHeader('authorization', validApiKey)
                    .reply(testCase.openRouterStatus, {
                    error: { message: `Error ${testCase.openRouterStatus}` },
                });
                const response = await (0, supertest_1.default)(app)
                    .get('/api/v1/models')
                    .set('Authorization', validApiKey)
                    .expect(testCase.expectedStatus);
                if (testCase.expectedStatus === 502) {
                    expect(response.body).toHaveProperty('error');
                    expect(response.body.error.code).toBe(testCase.errorType);
                    expect(response.body.error).toHaveProperty('correlationId');
                }
                expect(openRouterMock.isDone()).toBe(true);
                nock_1.default.cleanAll();
            }
        });
        it('should handle network timeouts with appropriate error responses', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', validApiKey)
                .delayConnection(35000)
                .reply(200, {});
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/models')
                .set('Authorization', validApiKey)
                .timeout(5000);
            expect(response.status).toBe(502);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error.code).toBe('UPSTREAM_ERROR');
            expect(response.body.error.message).toMatch(/timeout|unavailable/i);
            expect(response.body.error).toHaveProperty('correlationId');
        });
        it('should handle malformed JSON responses gracefully', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', validApiKey)
                .reply(200, 'invalid json response', {
                'content-type': 'application/json',
            });
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/models')
                .set('Authorization', validApiKey);
            expect(response.status).toBe(502);
            expect(response.body.error.code).toBe('UPSTREAM_ERROR');
            expect(response.body.error.message).toMatch(/invalid.*response/i);
            expect(response.body.error).toHaveProperty('correlationId');
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should not leak sensitive information in error responses', async () => {
            const errorScenarios = [
                {
                    name: 'Invalid API key format',
                    setup: () => ({
                        authorization: 'Bearer invalid-format-key',
                        expectedCode: 'UNAUTHORIZED',
                    }),
                },
                {
                    name: 'Missing authorization header',
                    setup: () => ({
                        authorization: null,
                        expectedCode: 'UNAUTHORIZED',
                    }),
                },
                {
                    name: 'Malformed bearer token',
                    setup: () => ({
                        authorization: 'InvalidBearer token',
                        expectedCode: 'UNAUTHORIZED',
                    }),
                },
            ];
            for (const scenario of errorScenarios) {
                const { authorization, expectedCode } = scenario.setup();
                const request_builder = (0, supertest_1.default)(app).get('/api/v1/me/credits');
                if (authorization) {
                    request_builder.set('Authorization', authorization);
                }
                const response = await request_builder.expect(401);
                expect(response.body.error.code).toBe(expectedCode);
                expect(response.body.error.message).not.toMatch(/sk-or-v1-/);
                expect(response.body.error.message).not.toMatch(/internal/i);
                expect(response.body.error).toHaveProperty('correlationId');
                expect(response.body.error.message).toMatch(/authorization|authentication|invalid/i);
            }
        });
        it('should include correlation IDs in all error responses', async () => {
            const errorEndpoints = [
                { path: '/api/v1/models', method: 'get' },
                { path: '/api/v1/me/credits', method: 'get' },
                { path: '/api/v1/chat/completions', method: 'post' },
            ];
            for (const endpoint of errorEndpoints) {
                const openRouterMock = (0, nock_1.default)('https://openrouter.ai')[endpoint.method](endpoint.path)
                    .matchHeader('authorization', validApiKey)
                    .reply(500, { error: 'Internal server error' });
                const requestBuilder = (0, supertest_1.default)(app)[endpoint.method](endpoint.path)
                    .set('Authorization', validApiKey);
                if (endpoint.method === 'post') {
                    requestBuilder.send({ test: 'data' });
                }
                const response = await requestBuilder;
                expect(response.body).toHaveProperty('error');
                expect(response.body.error).toHaveProperty('correlationId');
                expect(response.body.error.correlationId).toMatch(/^[a-f0-9-]{36}$/);
                expect(response.headers).toHaveProperty('x-correlation-id');
                expect(response.headers['x-correlation-id']).toBe(response.body.error.correlationId);
                expect(openRouterMock.isDone()).toBe(true);
                nock_1.default.cleanAll();
            }
        });
        it('should handle concurrent error scenarios efficiently', async () => {
            const concurrentRequests = 10;
            for (let i = 0; i < concurrentRequests; i++) {
                (0, nock_1.default)('https://openrouter.ai')
                    .get('/api/v1/models')
                    .matchHeader('authorization', validApiKey)
                    .reply(500, { error: `Server error ${i}` });
            }
            const startTime = Date.now();
            const promises = Array.from({ length: concurrentRequests }, () => (0, supertest_1.default)(app).get('/api/v1/models').set('Authorization', validApiKey));
            const results = await Promise.all(promises);
            const totalTime = Date.now() - startTime;
            results.forEach((response, index) => {
                expect(response.status).toBe(502);
                expect(response.body.error.code).toBe('UPSTREAM_ERROR');
                expect(response.body.error).toHaveProperty('correlationId');
            });
            expect(totalTime).toBeLessThan(2000);
        });
        it('should maintain error response format consistency', async () => {
            const errorTypes = [
                { status: 400, code: 'BAD_REQUEST' },
                { status: 401, code: 'UNAUTHORIZED' },
                { status: 429, code: 'RATE_LIMIT_EXCEEDED' },
                { status: 502, code: 'UPSTREAM_ERROR' },
            ];
            for (const errorType of errorTypes) {
                let response;
                if (errorType.status === 401) {
                    response = await (0, supertest_1.default)(app)
                        .get('/api/v1/me/credits')
                        .set('Authorization', 'Bearer invalid-key')
                        .expect(401);
                }
                else {
                    const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                        .get('/api/v1/models')
                        .matchHeader('authorization', validApiKey)
                        .reply(errorType.status === 502 ? 500 : errorType.status, {
                        error: { message: `Test error ${errorType.status}` },
                    });
                    response = await (0, supertest_1.default)(app)
                        .get('/api/v1/models')
                        .set('Authorization', validApiKey)
                        .expect(errorType.status);
                    expect(openRouterMock.isDone()).toBe(true);
                }
                expect(response.body).toHaveProperty('error');
                expect(response.body.error).toHaveProperty('code');
                expect(response.body.error).toHaveProperty('message');
                expect(response.body.error).toHaveProperty('correlationId');
                expect(response.body.error.code).toBe(errorType.code);
                expect(typeof response.body.error.message).toBe('string');
                expect(response.body.error.correlationId).toMatch(/^[a-f0-9-]{36}$/);
                nock_1.default.cleanAll();
            }
        });
    });
    describe('Credit transformation error scenarios', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        it('should handle credit transformation specific errors', async () => {
            const transformationErrors = [
                {
                    name: 'Missing usage field',
                    response: { limit: 100 },
                    expectedCode: 'INTERNAL_ERROR',
                    expectedMessage: /invalid.*response/i,
                },
                {
                    name: 'Invalid data types',
                    response: { limit: 'not-a-number', usage: 'also-not-a-number' },
                    expectedCode: 'INTERNAL_ERROR',
                    expectedMessage: /invalid.*data.*type/i,
                },
                {
                    name: 'Negative values',
                    response: { limit: -100, usage: -25 },
                    expectedCode: 'INTERNAL_ERROR',
                    expectedMessage: /invalid.*value/i,
                },
            ];
            for (const errorCase of transformationErrors) {
                const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                    .get('/api/v1/key')
                    .matchHeader('authorization', validApiKey)
                    .reply(200, errorCase.response);
                const response = await (0, supertest_1.default)(app)
                    .get('/api/v1/me/credits')
                    .set('Authorization', validApiKey)
                    .expect(500);
                expect(response.body.error.code).toBe(errorCase.expectedCode);
                expect(response.body.error.message).toMatch(errorCase.expectedMessage);
                expect(response.body.error).toHaveProperty('correlationId');
                expect(openRouterMock.isDone()).toBe(true);
                nock_1.default.cleanAll();
            }
        });
    });
});
//# sourceMappingURL=test_error_handling.test.js.map