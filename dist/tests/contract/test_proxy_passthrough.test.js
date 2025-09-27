"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const nock_1 = __importDefault(require("nock"));
const app_1 = require("../../src/app");
describe('Proxy Passthrough Contract Tests', () => {
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
    describe('GET /api/v1/models - Passthrough behavior', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        const mockOpenRouterResponse = {
            data: [
                { id: 'model-1', name: 'Test Model 1' },
                { id: 'model-2', name: 'Test Model 2' },
            ],
        };
        it('should forward request to OpenRouter API without modification', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', validApiKey)
                .reply(200, mockOpenRouterResponse, {
                'content-type': 'application/json',
                'x-custom-header': 'test-value',
            });
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/models')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(response.body).toEqual(mockOpenRouterResponse);
            expect(response.headers['content-type']).toMatch(/application\/json/);
            expect(response.headers['x-custom-header']).toBe('test-value');
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should preserve all request headers in passthrough', async () => {
            const customHeaders = {
                authorization: validApiKey,
                'x-custom-client': 'test-client',
                'user-agent': 'test-agent/1.0',
            };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', validApiKey)
                .matchHeader('x-custom-client', 'test-client')
                .matchHeader('user-agent', 'test-agent/1.0')
                .reply(200, mockOpenRouterResponse);
            await (0, supertest_1.default)(app).get('/api/v1/models').set(customHeaders).expect(200);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should preserve query parameters in passthrough', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .query({ limit: '10', offset: '0', filter: 'gpt' })
                .matchHeader('authorization', validApiKey)
                .reply(200, mockOpenRouterResponse);
            await (0, supertest_1.default)(app)
                .get('/api/v1/models?limit=10&offset=0&filter=gpt')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should forward authentication errors from OpenRouter', async () => {
            const openRouterErrorResponse = {
                error: {
                    message: 'Invalid API key',
                    type: 'authentication_error',
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
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should forward server errors from OpenRouter', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', validApiKey)
                .reply(500, { error: 'Internal server error' });
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/models')
                .set('Authorization', validApiKey)
                .expect(500);
            expect(response.body).toEqual({ error: 'Internal server error' });
            expect(openRouterMock.isDone()).toBe(true);
        });
    });
    describe('POST /api/v1/chat/completions - Passthrough behavior', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        const chatRequest = {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hello, world!' }],
        };
        const chatResponse = {
            choices: [
                {
                    message: { role: 'assistant', content: 'Hello! How can I help you?' },
                },
            ],
        };
        it('should forward POST requests with body preservation', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .post('/api/v1/chat/completions', chatRequest)
                .matchHeader('authorization', validApiKey)
                .matchHeader('content-type', /application\/json/)
                .reply(200, chatResponse);
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set('Authorization', validApiKey)
                .set('Content-Type', 'application/json')
                .send(chatRequest)
                .expect(200);
            expect(response.body).toEqual(chatResponse);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should preserve request body and headers for POST requests', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .post('/api/v1/chat/completions', chatRequest)
                .matchHeader('authorization', validApiKey)
                .matchHeader('x-custom-header', 'test-value')
                .reply(200, chatResponse);
            await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set('Authorization', validApiKey)
                .set('X-Custom-Header', 'test-value')
                .send(chatRequest)
                .expect(200);
            expect(openRouterMock.isDone()).toBe(true);
        });
    });
    describe('Edge cases and error handling', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        it.skip('should handle network timeouts gracefully', async () => {
        });
        it('should preserve HTTP methods other than GET and POST', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .delete('/api/v1/models/test-model')
                .matchHeader('authorization', validApiKey)
                .reply(204);
            await (0, supertest_1.default)(app)
                .delete('/api/v1/models/test-model')
                .set('Authorization', validApiKey)
                .expect(204);
            expect(openRouterMock.isDone()).toBe(true);
        });
    });
});
//# sourceMappingURL=test_proxy_passthrough.test.js.map