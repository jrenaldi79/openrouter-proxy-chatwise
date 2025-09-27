"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const nock_1 = __importDefault(require("nock"));
const app_1 = require("../../src/app");
describe('Complete Passthrough Flow Integration Tests', () => {
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
    describe('Scenario 1: Complete Passthrough Flow', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        it('should complete full passthrough flow for chat completions', async () => {
            const chatRequest = {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: 'What is the capital of France?' }],
                max_tokens: 100,
                temperature: 0.7,
            };
            const chatResponse = {
                id: 'chat-12345',
                object: 'chat.completion',
                created: 1234567890,
                model: 'gpt-3.5-turbo',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: 'The capital of France is Paris.',
                        },
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    prompt_tokens: 15,
                    completion_tokens: 8,
                    total_tokens: 23,
                },
            };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .post('/api/v1/chat/completions', chatRequest)
                .matchHeader('authorization', validApiKey)
                .matchHeader('content-type', /application\/json/)
                .reply(200, chatResponse, {
                'content-type': 'application/json',
                'x-ratelimit-remaining': '99',
                'x-openrouter-trace-id': 'trace-12345',
            });
            const startTime = Date.now();
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set('Authorization', validApiKey)
                .set('Content-Type', 'application/json')
                .set('X-Client-Id', 'test-client')
                .send(chatRequest)
                .expect(200);
            const responseTime = Date.now() - startTime;
            expect(response.body).toEqual(chatResponse);
            expect(response.headers['content-type']).toMatch(/application\/json/);
            expect(response.headers['x-ratelimit-remaining']).toBe('99');
            expect(response.headers['x-openrouter-trace-id']).toBe('trace-12345');
            expect(responseTime).toBeLessThan(200);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should preserve all request headers in passthrough', async () => {
            const customHeaders = {
                authorization: validApiKey,
                'content-type': 'application/json',
                'x-custom-client': 'test-client-v1.0',
                'x-request-id': 'req-12345',
                'user-agent': 'TestClient/1.0',
            };
            const chatRequest = {
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hello' }],
            };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .post('/api/v1/chat/completions', chatRequest)
                .matchHeader('authorization', validApiKey)
                .matchHeader('x-custom-client', 'test-client-v1.0')
                .matchHeader('x-request-id', 'req-12345')
                .matchHeader('user-agent', 'TestClient/1.0')
                .reply(200, { id: 'chat-test' });
            await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set(customHeaders)
                .send(chatRequest)
                .expect(200);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should handle different HTTP methods correctly', async () => {
            const getMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', validApiKey)
                .reply(200, { data: [] });
            await (0, supertest_1.default)(app)
                .get('/api/v1/models')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(getMock.isDone()).toBe(true);
            const putMock = (0, nock_1.default)('https://openrouter.ai')
                .put('/api/v1/account/settings')
                .matchHeader('authorization', validApiKey)
                .reply(200, { success: true });
            await (0, supertest_1.default)(app)
                .put('/api/v1/account/settings')
                .set('Authorization', validApiKey)
                .send({ setting: 'value' })
                .expect(200);
            expect(putMock.isDone()).toBe(true);
            const deleteMock = (0, nock_1.default)('https://openrouter.ai')
                .delete('/api/v1/files/test-file')
                .matchHeader('authorization', validApiKey)
                .reply(204);
            await (0, supertest_1.default)(app)
                .delete('/api/v1/files/test-file')
                .set('Authorization', validApiKey)
                .expect(204);
            expect(deleteMock.isDone()).toBe(true);
        });
        it('should forward query parameters correctly', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .query({
                limit: '10',
                offset: '20',
                filter: 'gpt',
                sort: 'name',
            })
                .matchHeader('authorization', validApiKey)
                .reply(200, { data: [] });
            await (0, supertest_1.default)(app)
                .get('/api/v1/models?limit=10&offset=20&filter=gpt&sort=name')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should handle large request bodies efficiently', async () => {
            const largeContent = 'x'.repeat(10000);
            const largeChatRequest = {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: largeContent }],
            };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .post('/api/v1/chat/completions', largeChatRequest)
                .matchHeader('authorization', validApiKey)
                .reply(200, { id: 'chat-large' });
            const startTime = Date.now();
            await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set('Authorization', validApiKey)
                .send(largeChatRequest)
                .expect(200);
            const responseTime = Date.now() - startTime;
            expect(responseTime).toBeLessThan(1000);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should maintain connection efficiency for multiple requests', async () => {
            const requests = Array.from({ length: 5 }, (_, i) => ({
                endpoint: `/api/v1/models?page=${i}`,
                mockPath: `/api/v1/models`,
                query: { page: i.toString() },
            }));
            requests.forEach(req => {
                (0, nock_1.default)('https://openrouter.ai')
                    .get(req.mockPath)
                    .query(req.query)
                    .matchHeader('authorization', validApiKey)
                    .reply(200, { page: req.query.page });
            });
            const startTime = Date.now();
            for (const req of requests) {
                await (0, supertest_1.default)(app)
                    .get(req.endpoint)
                    .set('Authorization', validApiKey)
                    .expect(200);
            }
            const totalTime = Date.now() - startTime;
            expect(totalTime).toBeLessThan(1000);
        });
    });
    describe('Error handling and edge cases', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        it('should handle OpenRouter API errors gracefully', async () => {
            const errorResponse = {
                error: {
                    message: 'Model not found',
                    type: 'invalid_request_error',
                    code: 'model_not_found',
                },
            };
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .post('/api/v1/chat/completions')
                .matchHeader('authorization', validApiKey)
                .reply(400, errorResponse);
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set('Authorization', validApiKey)
                .send({ model: 'invalid-model' })
                .expect(400);
            expect(response.body).toEqual(errorResponse);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should handle network timeouts appropriately', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .post('/api/v1/chat/completions')
                .matchHeader('authorization', validApiKey)
                .delayConnection(35000)
                .reply(200, {});
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set('Authorization', validApiKey)
                .send({ model: 'gpt-3.5-turbo' })
                .timeout(5000);
            expect(response.status).toBeGreaterThanOrEqual(500);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('correlationId');
        });
        it('should handle malformed JSON gracefully', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .post('/api/v1/chat/completions')
                .matchHeader('authorization', validApiKey)
                .reply(200, 'invalid json response');
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set('Authorization', validApiKey)
                .send({ model: 'gpt-3.5-turbo' });
            expect(response.status).toBeGreaterThanOrEqual(500);
            expect(response.body).toHaveProperty('error');
        });
    });
});
//# sourceMappingURL=test_passthrough_flow.test.js.map