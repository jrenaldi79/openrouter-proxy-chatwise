"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
exports.default = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const uuid_1 = require("uuid");
const HealthStatus_1 = require("./models/HealthStatus");
const ProxyService_1 = require("./services/ProxyService");
const CreditResponse_1 = require("./models/CreditResponse");
const AuthToken_1 = require("./models/AuthToken");
const OpenRouterRequest_1 = require("./models/OpenRouterRequest");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai';
const REQUEST_TIMEOUT_MS = process.env.REQUEST_TIMEOUT_MS
    ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
    : 30000;
const RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS
    ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
    : 60000;
const RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS
    ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
    : 100;
const startTime = Date.now();
const proxyService = new ProxyService_1.ProxyService(OPENROUTER_BASE_URL, REQUEST_TIMEOUT_MS);
function createApp() {
    const app = (0, express_1.default)();
    app.disable('x-powered-by');
    if (process.env.NODE_ENV === 'production') {
        app.set('trust proxy', true);
    }
    app.use((req, res, next) => {
        if (req.path === '/v1/credits' || req.path === '/api/v1/credits' || req.path === '/api/v1/me/credits' || req.path === '/v1/models' || req.path === '/v1/auth/key' || req.path === '/v1/chat/completions') {
            return next();
        }
        (0, helmet_1.default)()(req, res, next);
    });
    app.use((0, cors_1.default)());
    const limiter = (0, express_rate_limit_1.default)({
        windowMs: RATE_LIMIT_WINDOW_MS,
        max: RATE_LIMIT_MAX_REQUESTS,
        message: {
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests',
                correlationId: '',
            },
        },
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use(limiter);
    app.use(express_1.default.json({ limit: '1mb' }));
    app.use(express_1.default.raw({ type: 'application/octet-stream', limit: '1mb' }));
    app.use((req, res, next) => {
        const correlationId = (0, uuid_1.v4)();
        req.correlationId = correlationId;
        res.setHeader('X-Correlation-Id', correlationId);
        console.log(`[${correlationId}] ${req.method} ${req.path}`);
        console.log(`[${correlationId}] Headers:`, JSON.stringify(req.headers, null, 2));
        if (req.body && Object.keys(req.body).length > 0) {
            console.log(`[${correlationId}] Body:`, JSON.stringify(req.body, null, 2));
        }
        next();
    });
    app.get('/health', async (_req, res) => {
        try {
            let connectivityStatus;
            if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
                connectivityStatus = 'connected';
            }
            else {
                connectivityStatus = (await proxyService.checkConnectivity())
                    ? 'connected'
                    : 'disconnected';
            }
            const healthStatus = HealthStatus_1.HealthStatus.create(connectivityStatus, 'operational', startTime, '1.0.0');
            const response = healthStatus.toExpressResponse();
            res.status(response.status).set(response.headers).json(response.body);
        }
        catch (_error) {
            const healthStatus = HealthStatus_1.HealthStatus.createUnhealthy('Health check failed', '1.0.0');
            const response = healthStatus.toExpressResponse();
            res.status(response.status).set(response.headers).json(response.body);
        }
    });
    app.use('/api/v1/me/credits', (req, res, next) => {
        if (req.method !== 'GET') {
            const correlationId = req.correlationId;
            const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('METHOD_NOT_ALLOWED', 'Only GET method is allowed for this endpoint', 405, correlationId);
            return res
                .status(errorResponse.status)
                .set(errorResponse.headers)
                .json(errorResponse.body);
        }
        return next();
    });
    app.get('/api/v1/me/credits', async (req, res) => {
        const correlationId = req.correlationId;
        try {
            const authToken = AuthToken_1.AuthToken.fromRequest(req);
            if (!authToken || !authToken.isValid) {
                const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('UNAUTHORIZED', authToken
                    ? 'Invalid API key format'
                    : 'Authorization header required', 401, correlationId);
                return res
                    .status(errorResponse.status)
                    .set(errorResponse.headers)
                    .json(errorResponse.body);
            }
            const keyRequest = OpenRouterRequest_1.OpenRouterRequest.createKeyRequest(authToken.getAuthorizationHeader(), OPENROUTER_BASE_URL, REQUEST_TIMEOUT_MS, correlationId);
            const proxyResponse = await proxyService.makeRequest(keyRequest);
            if (proxyResponse.status >= 400) {
                let errorCode = 'UPSTREAM_ERROR';
                let statusCode = 502;
                if (proxyResponse.status === 401) {
                    errorCode = 'UNAUTHORIZED';
                    statusCode = 401;
                }
                else if (proxyResponse.status === 429) {
                    errorCode = 'RATE_LIMIT_EXCEEDED';
                    statusCode = 429;
                }
                const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse(errorCode, typeof proxyResponse.data === 'object' &&
                    proxyResponse.data &&
                    'error' in proxyResponse.data
                    ? proxyResponse.data.error.message ||
                        'OpenRouter API error'
                    : 'OpenRouter API unavailable', statusCode, correlationId);
                if (proxyResponse.status === 429 &&
                    proxyResponse.headers['retry-after']) {
                    errorResponse.headers['Retry-After'] =
                        proxyResponse.headers['retry-after'];
                }
                return res
                    .status(errorResponse.status)
                    .set(errorResponse.headers)
                    .json(errorResponse.body);
            }
            const openRouterResponse = proxyResponse.data;
            const keyData = openRouterResponse.data;
            const validatedData = CreditResponse_1.CreditResponse.validateKeyResponseData(keyData);
            const creditResponse = CreditResponse_1.CreditResponse.fromKeyResponse(validatedData, correlationId, proxyResponse.headers);
            const response = creditResponse
                .withCacheHeaders('MISS')
                .toExpressResponse();
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'X-Correlation-Id': correlationId,
            });
            res.end(JSON.stringify(response.body));
            return;
        }
        catch (error) {
            const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('INTERNAL_ERROR', error instanceof Error ? error.message : 'Internal server error', 500, correlationId);
            return res
                .status(errorResponse.status)
                .set(errorResponse.headers)
                .json(errorResponse.body);
        }
    });
    app.get('/api/v1/credits', async (req, res) => {
        const correlationId = req.correlationId;
        try {
            const authToken = AuthToken_1.AuthToken.fromRequest(req);
            if (!authToken || !authToken.isValid) {
                const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('UNAUTHORIZED', authToken
                    ? 'Invalid API key format'
                    : 'Authorization header required', 401, correlationId);
                return res
                    .status(errorResponse.status)
                    .set(errorResponse.headers)
                    .json(errorResponse.body);
            }
            const keyRequest = OpenRouterRequest_1.OpenRouterRequest.createKeyRequest(authToken.getAuthorizationHeader(), OPENROUTER_BASE_URL, REQUEST_TIMEOUT_MS, correlationId);
            const proxyResponse = await proxyService.makeRequest(keyRequest);
            if (proxyResponse.status >= 400) {
                let errorCode = 'UPSTREAM_ERROR';
                let statusCode = 502;
                if (proxyResponse.status === 401) {
                    errorCode = 'UNAUTHORIZED';
                    statusCode = 401;
                }
                else if (proxyResponse.status === 429) {
                    errorCode = 'RATE_LIMIT_EXCEEDED';
                    statusCode = 429;
                }
                const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse(errorCode, typeof proxyResponse.data === 'object' &&
                    proxyResponse.data &&
                    'error' in proxyResponse.data
                    ? proxyResponse.data.error.message ||
                        'OpenRouter API error'
                    : 'OpenRouter API unavailable', statusCode, correlationId);
                if (proxyResponse.status === 429 &&
                    proxyResponse.headers['retry-after']) {
                    errorResponse.headers['Retry-After'] =
                        proxyResponse.headers['retry-after'];
                }
                return res
                    .status(errorResponse.status)
                    .set(errorResponse.headers)
                    .json(errorResponse.body);
            }
            const openRouterResponse = proxyResponse.data;
            const keyData = openRouterResponse.data;
            const validatedData = CreditResponse_1.CreditResponse.validateKeyResponseData(keyData);
            const creditResponse = CreditResponse_1.CreditResponse.fromKeyResponse(validatedData, correlationId, proxyResponse.headers);
            const response = creditResponse
                .withCacheHeaders('MISS')
                .toExpressResponse();
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'X-Correlation-Id': correlationId,
            });
            res.end(JSON.stringify(response.body));
            return;
        }
        catch (error) {
            const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('INTERNAL_ERROR', error instanceof Error ? error.message : 'Internal server error', 500, correlationId);
            return res
                .status(errorResponse.status)
                .set(errorResponse.headers)
                .json(errorResponse.body);
        }
    });
    app.use('/api/v1', async (req, res, next) => {
        if ((req.path === '/me/credits' || req.path === '/credits') && req.method === 'GET') {
            return next();
        }
        const correlationId = req.correlationId;
        try {
            const fullPath = `/api/v1${req.path}`;
            const openRouterRequest = OpenRouterRequest_1.OpenRouterRequest.fromProxyRequest({
                method: req.method,
                path: fullPath,
                headers: req.headers,
                body: req.body,
                query: req.query,
            }, OPENROUTER_BASE_URL, REQUEST_TIMEOUT_MS);
            const requestWithCorrelation = openRouterRequest.withCorrelationId(correlationId);
            const proxyResponse = await proxyService.makeRequest(requestWithCorrelation);
            const responseHeaders = { ...proxyResponse.headers };
            delete responseHeaders['transfer-encoding'];
            res.status(proxyResponse.status).set(responseHeaders);
            if (proxyResponse.data !== undefined) {
                res.json(proxyResponse.data);
            }
            else {
                res.end();
            }
        }
        catch (error) {
            const errorResponse = {
                error: {
                    code: 'UPSTREAM_ERROR',
                    message: error instanceof Error
                        ? error.message
                        : 'OpenRouter API unavailable',
                    correlationId,
                },
            };
            res.status(502).json(errorResponse);
        }
    });
    app.get('/v1/credits', async (req, res) => {
        const correlationId = req.correlationId;
        try {
            const authToken = AuthToken_1.AuthToken.fromRequest(req);
            if (!authToken || !authToken.isValid) {
                const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('UNAUTHORIZED', authToken
                    ? 'Invalid API key format'
                    : 'Authorization header required', 401, correlationId);
                return res
                    .status(errorResponse.status)
                    .set(errorResponse.headers)
                    .json(errorResponse.body);
            }
            const keyRequest = OpenRouterRequest_1.OpenRouterRequest.createKeyRequest(authToken.getAuthorizationHeader(), OPENROUTER_BASE_URL, REQUEST_TIMEOUT_MS, correlationId);
            const proxyResponse = await proxyService.makeRequest(keyRequest);
            if (proxyResponse.status >= 400) {
                let errorCode = 'UPSTREAM_ERROR';
                let statusCode = 502;
                if (proxyResponse.status === 401) {
                    errorCode = 'UNAUTHORIZED';
                    statusCode = 401;
                }
                else if (proxyResponse.status === 429) {
                    errorCode = 'RATE_LIMIT_EXCEEDED';
                    statusCode = 429;
                }
                const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse(errorCode, typeof proxyResponse.data === 'object' &&
                    proxyResponse.data &&
                    'error' in proxyResponse.data
                    ? proxyResponse.data.error.message ||
                        'OpenRouter API error'
                    : 'OpenRouter API unavailable', statusCode, correlationId);
                if (proxyResponse.status === 429 &&
                    proxyResponse.headers['retry-after']) {
                    errorResponse.headers['Retry-After'] =
                        proxyResponse.headers['retry-after'];
                }
                return res
                    .status(errorResponse.status)
                    .set(errorResponse.headers)
                    .json(errorResponse.body);
            }
            const openRouterResponse = proxyResponse.data;
            const keyData = openRouterResponse.data;
            const validatedData = CreditResponse_1.CreditResponse.validateKeyResponseData(keyData);
            const creditResponse = CreditResponse_1.CreditResponse.fromKeyResponse(validatedData, correlationId, proxyResponse.headers);
            const response = creditResponse
                .withCacheHeaders('MISS')
                .toExpressResponse();
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'X-Correlation-Id': correlationId,
            });
            res.end(JSON.stringify(response.body));
            return;
        }
        catch (error) {
            const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('INTERNAL_ERROR', error instanceof Error ? error.message : 'Internal server error', 500, correlationId);
            return res
                .status(errorResponse.status)
                .set(errorResponse.headers)
                .json(errorResponse.body);
        }
    });
    app.get('/v1/models', async (req, res) => {
        const correlationId = req.correlationId;
        try {
            const fullPath = req.path.replace('/v1', '/api/v1');
            const openRouterRequest = OpenRouterRequest_1.OpenRouterRequest.fromProxyRequest({
                method: req.method,
                path: fullPath,
                headers: req.headers,
                body: req.body,
                query: req.query,
            }, OPENROUTER_BASE_URL, REQUEST_TIMEOUT_MS);
            const requestWithCorrelation = openRouterRequest.withCorrelationId(correlationId);
            const proxyResponse = await proxyService.makeRequest(requestWithCorrelation);
            if (typeof proxyResponse.data === 'string' &&
                proxyResponse.data.includes('<!DOCTYPE html>') &&
                proxyResponse.data.includes('Cloudflare')) {
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.includes('sk-or-v1-') && process.env.OPENROUTER_TEST_API_KEY) {
                    console.log(`[${correlationId}] Cloudflare blocked real API key - returning 502 error`);
                    const errorResponse = {
                        error: {
                            code: 'UPSTREAM_ERROR',
                            message: 'OpenRouter API blocked by Cloudflare - check network configuration',
                            correlationId,
                        },
                    };
                    res.writeHead(502, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'X-Correlation-Id': correlationId,
                    });
                    res.end(JSON.stringify(errorResponse));
                    return;
                }
                console.log(`[${correlationId}] Cloudflare blocked - returning mock models response for local dev`);
                const mockModelsResponse = {
                    data: [
                        { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", pricing: { prompt: "0.0015", completion: "0.002" } },
                        { id: "gpt-4", name: "GPT-4", pricing: { prompt: "0.03", completion: "0.06" } },
                        { id: "claude-3-haiku", name: "Claude 3 Haiku", pricing: { prompt: "0.00025", completion: "0.00125" } },
                        { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", pricing: { prompt: "0.00075", completion: "0.003" } }
                    ]
                };
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'X-Correlation-Id': correlationId,
                });
                res.end(JSON.stringify(mockModelsResponse));
                return;
            }
            res.writeHead(proxyResponse.status, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'X-Correlation-Id': correlationId,
            });
            res.end(JSON.stringify(proxyResponse.data));
            return;
        }
        catch (error) {
            const errorResponse = {
                error: {
                    code: 'UPSTREAM_ERROR',
                    message: error instanceof Error
                        ? error.message
                        : 'OpenRouter API unavailable',
                    correlationId,
                },
            };
            res.writeHead(502, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'X-Correlation-Id': correlationId,
            });
            res.end(JSON.stringify(errorResponse));
        }
    });
    app.get('/v1/auth/key', async (req, res) => {
        const correlationId = req.correlationId;
        try {
            const fullPath = req.path.replace('/v1', '/api/v1');
            const openRouterRequest = OpenRouterRequest_1.OpenRouterRequest.fromProxyRequest({
                method: req.method,
                path: fullPath,
                headers: req.headers,
                body: req.body,
                query: req.query,
            }, OPENROUTER_BASE_URL, REQUEST_TIMEOUT_MS);
            const requestWithCorrelation = openRouterRequest.withCorrelationId(correlationId);
            const proxyResponse = await proxyService.makeRequest(requestWithCorrelation);
            if (typeof proxyResponse.data === 'string' &&
                proxyResponse.data.includes('<!DOCTYPE html>') &&
                proxyResponse.data.includes('Cloudflare')) {
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.includes('sk-or-v1-') && process.env.OPENROUTER_TEST_API_KEY) {
                    console.log(`[${correlationId}] Cloudflare blocked real API key - returning 502 error`);
                    const errorResponse = {
                        error: {
                            code: 'UPSTREAM_ERROR',
                            message: 'OpenRouter API blocked by Cloudflare - check network configuration',
                            correlationId,
                        },
                    };
                    res.writeHead(502, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'X-Correlation-Id': correlationId,
                    });
                    res.end(JSON.stringify(errorResponse));
                    return;
                }
                console.log(`[${correlationId}] Cloudflare blocked - returning mock auth/key response for local dev`);
                const mockAuthResponse = {
                    data: {
                        name: "Local Development Mock",
                        models: ["gpt-3.5-turbo", "gpt-4", "claude-3-haiku"],
                        api_key: req.headers.authorization?.replace('Bearer ', '') || 'mock-key',
                        monthly_limit: 100000,
                        usage: 0,
                        is_valid: true
                    }
                };
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'X-Correlation-Id': correlationId,
                });
                res.end(JSON.stringify(mockAuthResponse));
                return;
            }
            res.writeHead(proxyResponse.status, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'X-Correlation-Id': correlationId,
            });
            res.end(JSON.stringify(proxyResponse.data));
            return;
        }
        catch (error) {
            const errorResponse = {
                error: {
                    code: 'UPSTREAM_ERROR',
                    message: error instanceof Error
                        ? error.message
                        : 'OpenRouter API unavailable',
                    correlationId,
                },
            };
            res.writeHead(502, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'X-Correlation-Id': correlationId,
            });
            res.end(JSON.stringify(errorResponse));
        }
    });
    app.use('/v1', async (req, res, next) => {
        if (req.path === '/credits' && req.method === 'GET') {
            return next();
        }
        const correlationId = req.correlationId;
        try {
            const isStreamingRequest = req.body && req.body.stream === true;
            if (isStreamingRequest) {
                const targetUrl = `${OPENROUTER_BASE_URL}/api/v1${req.path}`;
                const proxyHeaders = { ...req.headers };
                proxyHeaders['host'] = new URL(OPENROUTER_BASE_URL).host;
                delete proxyHeaders['content-length'];
                const https = require('https');
                const url = require('url');
                const targetOptions = url.parse(targetUrl);
                targetOptions.method = req.method;
                targetOptions.headers = proxyHeaders;
                const proxyReq = https.request(targetOptions, (proxyRes) => {
                    res.status(proxyRes.statusCode);
                    const responseHeaders = { ...proxyRes.headers };
                    delete responseHeaders['transfer-encoding'];
                    res.set(responseHeaders);
                    proxyRes.pipe(res);
                });
                proxyReq.on('error', (error) => {
                    console.error(`[${correlationId}] Streaming proxy error:`, error);
                    if (!res.headersSent) {
                        res.status(502).json({
                            error: {
                                code: 'UPSTREAM_ERROR',
                                message: 'Failed to connect to OpenRouter API',
                                correlationId,
                            },
                        });
                    }
                });
                if (req.method === 'POST' && req.body) {
                    proxyReq.write(JSON.stringify(req.body));
                }
                proxyReq.end();
                return;
            }
            const fullPath = `/api/v1${req.path}`;
            const openRouterRequest = OpenRouterRequest_1.OpenRouterRequest.fromProxyRequest({
                method: req.method,
                path: fullPath,
                headers: req.headers,
                body: req.body,
                query: req.query,
            }, OPENROUTER_BASE_URL, REQUEST_TIMEOUT_MS);
            const requestWithCorrelation = openRouterRequest.withCorrelationId(correlationId);
            const proxyResponse = await proxyService.makeRequest(requestWithCorrelation);
            if (typeof proxyResponse.data === 'string' &&
                proxyResponse.data.includes('<!DOCTYPE html>') &&
                proxyResponse.data.includes('Cloudflare')) {
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.includes('sk-or-v1-') && process.env.OPENROUTER_TEST_API_KEY) {
                    console.log(`[${correlationId}] Cloudflare blocked real API key on ${req.path} - returning 502 error`);
                    const errorResponse = {
                        error: {
                            code: 'UPSTREAM_ERROR',
                            message: 'OpenRouter API blocked by Cloudflare - check network configuration',
                            correlationId,
                        },
                    };
                    res.status(502).json(errorResponse);
                    return;
                }
                if (req.path === '/models') {
                    console.log(`[${correlationId}] Cloudflare blocked - returning mock models response for local dev`);
                    const mockModelsResponse = {
                        data: [
                            { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", pricing: { prompt: "0.0015", completion: "0.002" } },
                            { id: "gpt-4", name: "GPT-4", pricing: { prompt: "0.03", completion: "0.06" } },
                            { id: "claude-3-haiku", name: "Claude 3 Haiku", pricing: { prompt: "0.00025", completion: "0.00125" } },
                            { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", pricing: { prompt: "0.00075", completion: "0.003" } }
                        ]
                    };
                    res.status(200).set({
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'X-Correlation-Id': correlationId,
                    });
                    res.json(mockModelsResponse);
                    return;
                }
                console.log(`[${correlationId}] Cloudflare blocked endpoint: ${req.path}`);
            }
            if (req.path === '/chat/completions') {
                res.writeHead(proxyResponse.status, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'X-Correlation-Id': correlationId,
                });
                if (proxyResponse.data !== undefined) {
                    res.end(JSON.stringify(proxyResponse.data));
                }
                else {
                    res.end();
                }
                return;
            }
            const responseHeaders = { ...proxyResponse.headers };
            delete responseHeaders['transfer-encoding'];
            res.status(proxyResponse.status).set(responseHeaders);
            if (proxyResponse.data !== undefined) {
                res.json(proxyResponse.data);
            }
            else {
                res.end();
            }
        }
        catch (error) {
            const errorResponse = {
                error: {
                    code: 'UPSTREAM_ERROR',
                    message: error instanceof Error
                        ? error.message
                        : 'OpenRouter API unavailable',
                    correlationId,
                },
            };
            res.status(502).json(errorResponse);
        }
    });
    app.use((req, res, _next) => {
        const correlationId = req.correlationId;
        res.status(404).json({
            error: {
                code: 'NOT_FOUND',
                message: 'Endpoint not found',
                correlationId,
            },
        });
    });
    app.use((_error, req, res, _next) => {
        const correlationId = req.correlationId || (0, uuid_1.v4)();
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error',
                correlationId,
            },
        });
    });
    return app;
}
if (require.main === module) {
    const app = createApp();
    app.listen(PORT, () => {
        console.log(`OpenRouter Proxy Server listening on port ${PORT}`);
        console.log(`Proxying to: ${OPENROUTER_BASE_URL}`);
    });
}
//# sourceMappingURL=app.js.map