"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const nock_1 = __importDefault(require("nock"));
const app_1 = require("../../src/app");
describe('Security Validation Integration Tests', () => {
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
    describe('Scenario 5: Security Validation', () => {
        const validApiKey = 'Bearer sk-or-v1-test-key-123';
        it('should enforce rate limiting per IP address', async () => {
            const rateLimitRequests = 102;
            const responses = [];
            for (let i = 0; i < rateLimitRequests; i++) {
                (0, nock_1.default)('https://openrouter.ai')
                    .get('/api/v1/models')
                    .matchHeader('authorization', validApiKey)
                    .reply(200, { data: [] });
            }
            for (let i = 0; i < rateLimitRequests; i++) {
                const response = await (0, supertest_1.default)(app)
                    .get('/api/v1/models')
                    .set('Authorization', validApiKey);
                responses.push(response);
            }
            const rateLimitedResponses = responses.filter(r => r.status === 429);
            expect(rateLimitedResponses.length).toBeGreaterThan(0);
            const rateLimitResponse = rateLimitedResponses[0];
            expect(rateLimitResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
            expect(rateLimitResponse.body.error.message).toMatch(/rate.*limit/i);
            expect(rateLimitResponse.headers).toHaveProperty('retry-after');
        });
        it('should validate API key format strictly', async () => {
            const invalidApiKeys = [
                'invalid-key',
                'Bearer invalid-format',
                'Bearer sk-invalid-format',
                'Bearer sk-or-v2-invalid',
                'sk-or-v1-without-bearer',
                'Bearer ',
                '',
            ];
            for (const invalidKey of invalidApiKeys) {
                const requestBuilder = (0, supertest_1.default)(app).get('/api/v1/me/credits');
                if (invalidKey) {
                    requestBuilder.set('Authorization', invalidKey);
                }
                const response = await requestBuilder.expect(401);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
                expect(response.body.error.message).toMatch(/invalid.*api.*key|authorization.*required/i);
                expect(response.body.error).toHaveProperty('correlationId');
            }
        });
        it('should include security headers in all responses', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', validApiKey)
                .reply(200, { data: [] });
            const response = await (0, supertest_1.default)(app)
                .get('/api/v1/models')
                .set('Authorization', validApiKey)
                .expect(200);
            const securityHeaders = [
                'x-content-type-options',
                'x-frame-options',
                'x-xss-protection',
                'strict-transport-security',
                'x-dns-prefetch-control',
            ];
            securityHeaders.forEach(header => {
                expect(response.headers).toHaveProperty(header);
            });
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-frame-options']).toBe('DENY');
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should handle CORS properly for allowed origins', async () => {
            const allowedOrigins = [
                'https://app.example.com',
                'https://dashboard.example.com',
                'http://localhost:3000',
            ];
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', validApiKey)
                .reply(200, { data: [] })
                .persist();
            for (const origin of allowedOrigins) {
                const preflightResponse = await (0, supertest_1.default)(app)
                    .options('/api/v1/models')
                    .set('Origin', origin)
                    .set('Access-Control-Request-Method', 'GET')
                    .set('Access-Control-Request-Headers', 'authorization');
                expect(preflightResponse.status).toBe(204);
                expect(preflightResponse.headers['access-control-allow-origin']).toBe(origin);
                expect(preflightResponse.headers['access-control-allow-methods']).toMatch(/GET/);
                expect(preflightResponse.headers['access-control-allow-headers']).toMatch(/authorization/i);
                const actualResponse = await (0, supertest_1.default)(app)
                    .get('/api/v1/models')
                    .set('Origin', origin)
                    .set('Authorization', validApiKey)
                    .expect(200);
                expect(actualResponse.headers['access-control-allow-origin']).toBe(origin);
            }
        });
        it('should reject requests from disallowed origins', async () => {
            const disallowedOrigins = [
                'https://malicious-site.com',
                'http://attacker.example',
                'https://phishing-site.net',
            ];
            for (const origin of disallowedOrigins) {
                const response = await (0, supertest_1.default)(app)
                    .options('/api/v1/models')
                    .set('Origin', origin)
                    .set('Access-Control-Request-Method', 'GET');
                expect(response.headers['access-control-allow-origin']).toBeUndefined();
            }
        });
        it('should sanitize input data to prevent injection attacks', async () => {
            const maliciousInputs = [
                { header: 'X-Malicious', value: '<script>alert("xss")</script>' },
                { header: 'X-Injection', value: "'; DROP TABLE users; --" },
                { header: 'X-Command', value: '$(rm -rf /)' },
                { header: 'X-Path', value: '../../../etc/passwd' },
            ];
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .get('/api/v1/models')
                .matchHeader('authorization', validApiKey)
                .reply(200, { data: [] })
                .persist();
            for (const maliciousInput of maliciousInputs) {
                const response = await (0, supertest_1.default)(app)
                    .get('/api/v1/models')
                    .set('Authorization', validApiKey)
                    .set(maliciousInput.header, maliciousInput.value)
                    .expect(200);
                const responseText = JSON.stringify(response.body) + JSON.stringify(response.headers);
                expect(responseText).not.toContain('<script>');
                expect(responseText).not.toContain('DROP TABLE');
                expect(responseText).not.toContain('$(rm');
                expect(responseText).not.toContain('../../../');
            }
        });
        it('should prevent request smuggling attacks', async () => {
            const openRouterMock = (0, nock_1.default)('https://openrouter.ai')
                .post('/api/v1/chat/completions')
                .matchHeader('authorization', validApiKey)
                .reply(200, { id: 'chat-test' });
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set('Authorization', validApiKey)
                .set('Content-Length', '13')
                .set('Content-Length', '0')
                .send({ model: 'gpt-3.5-turbo' });
            expect(response.status).toBeLessThan(500);
            expect(openRouterMock.isDone()).toBe(true);
        });
        it('should enforce request size limits', async () => {
            const oversizedPayload = {
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: 'x'.repeat(2 * 1024 * 1024),
                    },
                ],
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/chat/completions')
                .set('Authorization', validApiKey)
                .send(oversizedPayload);
            expect(response.status).toBe(413);
            expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
        });
        it('should prevent timing attacks on API key validation', async () => {
            const validKey = 'Bearer sk-or-v1-' + 'a'.repeat(64);
            const invalidKeys = [
                'Bearer sk-or-v1-' + 'b'.repeat(64),
                'Bearer sk-or-v1-' + 'c'.repeat(32),
                'Bearer invalid-format',
            ];
            const validTimings = [];
            for (let i = 0; i < 5; i++) {
                const start = Date.now();
                await (0, supertest_1.default)(app)
                    .get('/api/v1/me/credits')
                    .set('Authorization', validKey);
                validTimings.push(Date.now() - start);
            }
            const invalidTimings = [];
            for (const invalidKey of invalidKeys) {
                for (let i = 0; i < 5; i++) {
                    const start = Date.now();
                    await (0, supertest_1.default)(app)
                        .get('/api/v1/me/credits')
                        .set('Authorization', invalidKey);
                    invalidTimings.push(Date.now() - start);
                }
            }
            const validAvg = validTimings.reduce((a, b) => a + b) / validTimings.length;
            const invalidAvg = invalidTimings.reduce((a, b) => a + b) / invalidTimings.length;
            expect(Math.abs(validAvg - invalidAvg)).toBeLessThan(50);
        });
        it('should log security events without exposing sensitive data', async () => {
            const securityEvents = [
                {
                    action: () => (0, supertest_1.default)(app).get('/api/v1/me/credits'),
                    expectedEvent: 'MISSING_AUTHORIZATION',
                },
                {
                    action: () => (0, supertest_1.default)(app)
                        .get('/api/v1/me/credits')
                        .set('Authorization', 'Bearer invalid-format'),
                    expectedEvent: 'INVALID_API_KEY_FORMAT',
                },
            ];
            for (const event of securityEvents) {
                const response = await event.action();
                expect(response.status).toBe(401);
                expect(response.body.error).toHaveProperty('correlationId');
            }
        });
        it('should handle concurrent security validation efficiently', async () => {
            const concurrentRequests = 20;
            const securityScenarios = [
                { auth: validApiKey, expectStatus: 200 },
                { auth: 'Bearer invalid-format', expectStatus: 401 },
                { auth: null, expectStatus: 401 },
                { auth: 'Bearer sk-or-v1-too-short', expectStatus: 401 },
            ];
            const validRequests = Math.ceil(concurrentRequests / securityScenarios.length);
            for (let i = 0; i < validRequests; i++) {
                (0, nock_1.default)('https://openrouter.ai')
                    .get('/api/v1/models')
                    .matchHeader('authorization', validApiKey)
                    .reply(200, { data: [] });
            }
            const startTime = Date.now();
            const promises = Array.from({ length: concurrentRequests }, (_, index) => {
                const scenario = securityScenarios[index % securityScenarios.length];
                const requestBuilder = (0, supertest_1.default)(app).get('/api/v1/models');
                if (scenario.auth) {
                    requestBuilder.set('Authorization', scenario.auth);
                }
                return requestBuilder;
            });
            const results = await Promise.all(promises);
            const totalTime = Date.now() - startTime;
            results.forEach((response, index) => {
                const expectedScenario = securityScenarios[index % securityScenarios.length];
                expect(response.status).toBe(expectedScenario.expectStatus);
            });
            expect(totalTime).toBeLessThan(3000);
        });
    });
    describe('Authentication and authorization edge cases', () => {
        it('should handle various Bearer token formats correctly', async () => {
            const tokenFormats = [
                { token: 'Bearer sk-or-v1-valid-key-format-12345678', valid: true },
                { token: 'bearer sk-or-v1-lowercase-bearer', valid: false },
                { token: 'Bearer  sk-or-v1-extra-spaces', valid: false },
                { token: 'Bearer sk-or-v1-', valid: false },
                { token: 'Bearersk-or-v1-no-space', valid: false },
                { token: 'Bearer sk-or-v1-valid' + 'x'.repeat(100), valid: true },
            ];
            for (const format of tokenFormats) {
                const response = await (0, supertest_1.default)(app)
                    .get('/api/v1/me/credits')
                    .set('Authorization', format.token);
                if (format.valid) {
                    expect(response.status).not.toBe(401);
                }
                else {
                    expect(response.status).toBe(401);
                    expect(response.body.error.code).toBe('UNAUTHORIZED');
                }
            }
        });
        it('should handle missing or malformed authorization headers', async () => {
            const authHeaders = [
                { name: 'Missing header', value: undefined },
                { name: 'Empty header', value: '' },
                { name: 'Wrong scheme', value: 'Basic dXNlcjpwYXNz' },
                { name: 'No scheme', value: 'sk-or-v1-token-without-scheme' },
                { name: 'Multiple schemes', value: 'Bearer Basic sk-or-v1-confused' },
            ];
            for (const headerCase of authHeaders) {
                const requestBuilder = (0, supertest_1.default)(app).get('/api/v1/me/credits');
                if (headerCase.value !== undefined) {
                    requestBuilder.set('Authorization', headerCase.value);
                }
                const response = await requestBuilder.expect(401);
                expect(response.body.error.code).toBe('UNAUTHORIZED');
                expect(response.body.error.message).toMatch(/authorization.*required|invalid.*api.*key/i);
            }
        });
    });
});
//# sourceMappingURL=test_security.test.js.map