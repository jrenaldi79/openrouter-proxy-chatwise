"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const nock_1 = __importDefault(require("nock"));
const app_1 = require("../../src/app");
describe('Cache Behavior Validation Integration Tests', () => {
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
    describe('Scenario 3: Cache Behavior Validation', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        const openRouterKeyResponse = {
            limit: 100.5,
            usage: 25.75,
        };
        it('should cache credit responses for subsequent requests', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse);
            const response1StartTime = Date.now();
            const response1 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            const response1Time = Date.now() - response1StartTime;
            expect(openRouterMock.isDone()).toBe(true);
            const response2StartTime = Date.now();
            const response2 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            const response2Time = Date.now() - response2StartTime;
            expect(response2Time).toBeLessThan(response1Time);
            expect(response2Time).toBeLessThan(50);
            expect(response2.body).toEqual(response1.body);
            expect(response1.headers['x-cache']).toBe('MISS');
            expect(response2.headers['x-cache']).toBe('HIT');
        });
        it('should cache responses per API key independently', async () => {
            const apiKey1 = 'Bearer sk-or-v1-key-1';
            const apiKey2 = 'Bearer sk-or-v1-key-2';
            const response1 = { limit: 100, usage: 25 };
            const response2 = { limit: 200, usage: 50 };
            const mock1 = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', apiKey1)
                .reply(200, response1);
            const mock2 = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', apiKey2)
                .reply(200, response2);
            const result1 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', apiKey1)
                .expect(200);
            const result2 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', apiKey2)
                .expect(200);
            expect(result1.body.data.total_credits).toBe(100);
            expect(result2.body.data.total_credits).toBe(200);
            expect(mock1.isDone()).toBe(true);
            expect(mock2.isDone()).toBe(true);
            const cached1 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', apiKey1)
                .expect(200);
            const cached2 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', apiKey2)
                .expect(200);
            expect(cached1.body).toEqual(result1.body);
            expect(cached2.body).toEqual(result2.body);
            expect(cached1.headers['x-cache']).toBe('HIT');
            expect(cached2.headers['x-cache']).toBe('HIT');
        });
        it('should expire cache after TTL and make new requests', async () => {
            const firstMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, { limit: 100, usage: 25 });
            const response1 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(response1.headers['x-cache']).toBe('MISS');
            expect(firstMock.isDone()).toBe(true);
            await (0, supertest_1.default)(app).delete('/internal/cache').expect(200);
            const secondMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, { limit: 100, usage: 30 });
            const response2 = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(response2.headers['x-cache']).toBe('MISS');
            expect(response2.body.data.total_usage).toBe(30);
            expect(secondMock.isDone()).toBe(true);
        });
        it('should handle cache misses gracefully when cache is disabled', async () => {
            process.env.CACHE_TTL_SECONDS = '0';
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse)
                .persist();
            for (let i = 0; i < 3; i++) {
                const response = await (0, supertest_1.default)(app)
                    .get('/api/v1/me/credits')
                    .set('Authorization', validApiKey)
                    .expect(200);
                expect(response.headers['x-cache']).toBe('DISABLED');
            }
            delete process.env.CACHE_TTL_SECONDS;
        });
        it('should provide cache statistics and metrics', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse);
            await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            const statsResponse = await (0, supertest_1.default)(app)
                .get('/internal/cache/stats')
                .expect(200);
            expect(statsResponse.body).toHaveProperty('hits');
            expect(statsResponse.body).toHaveProperty('misses');
            expect(statsResponse.body).toHaveProperty('hitRate');
            expect(statsResponse.body).toHaveProperty('totalKeys');
            expect(statsResponse.body.hits).toBe(2);
            expect(statsResponse.body.misses).toBe(1);
            expect(statsResponse.body.hitRate).toBeCloseTo(0.67, 2);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should handle cache errors gracefully without affecting functionality', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, openRouterKeyResponse)
                .persist();
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(response.body.data.total_credits).toBe(100.5);
            expect(response.headers['x-cache']).toBe('ERROR');
        });
        it('should respect cache size limits and implement LRU eviction', async () => {
            const apiKeys = Array.from({ length: 10 }, (_, i) => `Bearer sk-or-v1-key-${i.toString().padStart(3, '0')}`);
            apiKeys.forEach((key, index) => {
                (0, nock_1.default)('https://openrouter.ai')
                    .get('/api/v1/key')
                    .matchHeader('authorization', key)
                    .reply(200, { limit: 100, usage: index });
            });
            for (const key of apiKeys) {
                await (0, supertest_1.default)(app)
                    .get('/api/v1/me/credits')
                    .set('Authorization', key)
                    .expect(200);
            }
            const statsResponse = await (0, supertest_1.default)(app)
                .get('/internal/cache/stats')
                .expect(200);
            expect(statsResponse.body.totalKeys).toBeLessThanOrEqual(5);
        });
    });
    describe('Cache performance characteristics', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        it('should provide consistent cache hit performance', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, { limit: 100, usage: 25 });
            await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(openRouterMock.isDone()).toBe(true);
            const cacheTimes = [];
            for (let i = 0; i < 10; i++) {
                const startTime = Date.now();
                await (0, supertest_1.default)(app)
                    .get('/api/v1/me/credits')
                    .set('Authorization', validApiKey)
                    .expect(200);
                cacheTimes.push(Date.now() - startTime);
            }
            cacheTimes.forEach(time => {
                expect(time).toBeLessThan(50);
            });
            const average = cacheTimes.reduce((a, b) => a + b) / cacheTimes.length;
            const variance = cacheTimes.reduce((sum, time) => sum + Math.pow(time - average, 2), 0) /
                cacheTimes.length;
            expect(variance).toBeLessThan(100);
        });
        it('should handle concurrent cache access efficiently', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/key')
                .matchHeader('authorization', validApiKey)
                .reply(200, { limit: 100, usage: 25 });
            await (0, supertest_1.default)(app)
                .get('/api/v1/me/credits')
                .set('Authorization', validApiKey)
                .expect(200);
            expect(openRouterMock.isDone()).toBe(true);
            const concurrentRequests = 20;
            const startTime = Date.now();
            const promises = Array.from({ length: concurrentRequests }, () => (0, supertest_1.default)(app).get('/api/v1/me/credits').set('Authorization', validApiKey));
            const results = await Promise.all(promises);
            const totalTime = Date.now() - startTime;
            results.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.headers['x-cache']).toBe('HIT');
            });
            expect(totalTime).toBeLessThan(500);
        });
    });
});
//# sourceMappingURL=test_cache_behavior.test.js.map