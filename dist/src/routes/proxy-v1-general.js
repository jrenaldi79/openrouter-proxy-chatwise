"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.v1ProxyHandler = v1ProxyHandler;
const https_1 = __importDefault(require("https"));
const url_1 = __importDefault(require("url"));
const services_1 = require("../config/services");
const environment_1 = require("../config/environment");
const logger_1 = require("../utils/logger");
const weave_1 = require("../config/weave");
const weave_tracing_1 = require("../middleware/weave-tracing");
const langfuse_1 = require("../config/langfuse");
const langfuse_tracing_1 = require("../middleware/langfuse-tracing");
const proxy_utils_1 = require("./proxy-utils");
function handleStreamingRequest(req, res, correlationId) {
    const targetUrl = `${environment_1.envConfig.OPENROUTER_BASE_URL}/api/v1${req.path}`;
    const proxyHeaders = { ...req.headers };
    proxyHeaders['host'] = new URL(environment_1.envConfig.OPENROUTER_BASE_URL).host;
    delete proxyHeaders['content-length'];
    const hasWeaveData = req.hasWeaveData || false;
    const hasLangfuseData = req.hasLangfuseData || false;
    const shouldTrace = hasWeaveData || hasLangfuseData;
    let streamBuffer = '';
    const targetOptions = url_1.default.parse(targetUrl);
    targetOptions.method = req.method;
    targetOptions.headers = proxyHeaders;
    const proxyReq = https_1.default.request(targetOptions, (proxyRes) => {
        res.status(proxyRes.statusCode || 500);
        const responseHeaders = { ...proxyRes.headers };
        delete responseHeaders['transfer-encoding'];
        res.set(responseHeaders);
        proxyRes.on('data', (chunk) => {
            if (shouldTrace) {
                streamBuffer += chunk.toString();
            }
            res.write(chunk);
        });
        proxyRes.on('end', async () => {
            res.end();
            if (shouldTrace && streamBuffer) {
                try {
                    const { parseAndAccumulateSSE } = await Promise.resolve().then(() => __importStar(require('../utils/sse-parser')));
                    const { traceStreamingCompletion } = await Promise.resolve().then(() => __importStar(require('../utils/async-tracer')));
                    logger_1.Logger.info('Stream completed, starting async trace', correlationId);
                    const accumulatedResponse = parseAndAccumulateSSE(streamBuffer, correlationId);
                    const chatRequest = req.body;
                    const tracingInput = {
                        model: chatRequest.model || 'unknown',
                        messages: chatRequest.messages || [],
                        temperature: chatRequest.temperature,
                        max_tokens: chatRequest.max_tokens,
                        top_p: chatRequest.top_p,
                        n: chatRequest.n,
                        presence_penalty: chatRequest.presence_penalty,
                        frequency_penalty: chatRequest.frequency_penalty,
                        correlationId,
                    };
                    await traceStreamingCompletion(tracingInput, accumulatedResponse, correlationId, hasWeaveData, hasLangfuseData);
                }
                catch (error) {
                    logger_1.Logger.error('Async streaming trace failed', correlationId, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        });
    });
    proxyReq.on('error', (error) => {
        logger_1.Logger.error('Streaming proxy error', correlationId, {
            error: error.message,
            stack: error.stack,
        });
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
}
async function v1ProxyHandler(req, res, next) {
    if (req.path === '/credits' && req.method === 'GET') {
        return next();
    }
    const correlationId = req.correlationId;
    try {
        const isStreamingRequest = req.body && req.body.stream === true;
        if (isStreamingRequest) {
            handleStreamingRequest(req, res, correlationId);
            return;
        }
        const fullPath = `/api/v1${req.path}`;
        const openRouterRequest = (0, proxy_utils_1.createOpenRouterRequest)(req, fullPath, correlationId);
        let proxyResponse;
        const isChatCompletion = req.path === '/chat/completions';
        const hasWeaveData = req.__weaveRequestData;
        const hasLangfuseData = req.__langfuseRequestData;
        const needsTracing = isChatCompletion && (((0, weave_1.isWeaveEnabled)() && hasWeaveData) ||
            ((0, langfuse_1.isLangfuseEnabled)() && hasLangfuseData));
        if (needsTracing) {
            const requestBody = req.body;
            const llmInput = {
                model: requestBody.model,
                messages: requestBody.messages,
                temperature: requestBody.temperature ?? 1,
                max_tokens: requestBody.max_tokens,
                top_p: requestBody.top_p ?? 1,
                n: requestBody.n ?? 1,
                presence_penalty: requestBody.presence_penalty ?? 0,
                frequency_penalty: requestBody.frequency_penalty ?? 0,
                correlationId,
            };
            if ((0, weave_1.isWeaveEnabled)() && hasWeaveData && (0, langfuse_1.isLangfuseEnabled)() && hasLangfuseData) {
                const weaveTracedCall = (0, weave_tracing_1.createTracedLLMCall)((request) => services_1.proxyService.makeRequest(request), openRouterRequest);
                const llmResponse = await weaveTracedCall(llmInput);
                (0, langfuse_tracing_1.createTracedLangfuseLLMCall)(async () => ({ status: 200, headers: {}, data: llmResponse }), openRouterRequest, llmInput)().catch((error) => {
                    logger_1.Logger.error('Langfuse tracing failed (non-blocking)', correlationId, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                });
                proxyResponse = {
                    status: 200,
                    headers: {},
                    data: llmResponse,
                };
                logger_1.Logger.info('Both Weave and Langfuse traces created', correlationId, {
                    model: requestBody.model,
                });
            }
            else if ((0, weave_1.isWeaveEnabled)() && hasWeaveData) {
                const tracedCall = (0, weave_tracing_1.createTracedLLMCall)((request) => services_1.proxyService.makeRequest(request), openRouterRequest);
                const llmResponse = await tracedCall(llmInput);
                proxyResponse = {
                    status: 200,
                    headers: {},
                    data: llmResponse,
                };
                logger_1.Logger.info('Weave trace created for chat completion', correlationId, {
                    model: requestBody.model,
                });
            }
            else if ((0, langfuse_1.isLangfuseEnabled)() && hasLangfuseData) {
                const tracedCall = (0, langfuse_tracing_1.createTracedLangfuseLLMCall)((request) => services_1.proxyService.makeRequest(request), openRouterRequest, llmInput);
                const llmResponse = await tracedCall();
                proxyResponse = {
                    status: 200,
                    headers: {},
                    data: llmResponse,
                };
                logger_1.Logger.info('Langfuse trace created for chat completion', correlationId, {
                    model: requestBody.model,
                });
            }
            else {
                proxyResponse = await services_1.proxyService.makeRequest(openRouterRequest);
            }
        }
        else {
            proxyResponse = await services_1.proxyService.makeRequest(openRouterRequest);
        }
        if (req.path === '/chat/completions') {
            (0, proxy_utils_1.sendCleanResponse)(res, proxyResponse.status, proxyResponse.data, correlationId);
            return;
        }
        if (proxyResponse.status >= 400) {
            const { code: errorCode, statusCode } = (0, proxy_utils_1.mapStatusToErrorCode)(proxyResponse.status);
            const errorResponse = {
                error: {
                    code: errorCode,
                    message: typeof proxyResponse.data === 'object' &&
                        proxyResponse.data &&
                        'error' in proxyResponse.data
                        ? proxyResponse.data.error
                            .message || 'OpenRouter API error'
                        : 'OpenRouter API error',
                    correlationId,
                },
            };
            res.status(statusCode).json(errorResponse);
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
                message: error instanceof Error ? error.message : 'OpenRouter API unavailable',
                correlationId,
            },
        };
        res.status(502).json(errorResponse);
    }
}
//# sourceMappingURL=proxy-v1-general.js.map