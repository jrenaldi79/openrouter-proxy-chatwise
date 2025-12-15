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
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const services_1 = require("../config/services");
const environment_1 = require("../config/environment");
const logger_1 = require("../utils/logger");
const weave_1 = require("../config/weave");
const weave_tracing_1 = require("../middleware/weave-tracing");
const langfuse_1 = require("../config/langfuse");
const langfuse_tracing_1 = require("../middleware/langfuse-tracing");
const proxy_utils_1 = require("./proxy-utils");
const provider_routing_1 = require("../utils/provider-routing");
const retry_1 = require("../utils/retry");
const model_limits_1 = require("../config/model-limits");
const context_warning_1 = require("../utils/context-warning");
const PROBLEMATIC_HEADERS = new Set([
    'host',
    'connection',
    'upgrade',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'content-length',
    ':authority',
    ':method',
    ':path',
    ':scheme',
    'x-forwarded-for',
    'x-forwarded-proto',
    'x-forwarded-host',
    'x-real-ip',
    'if-modified-since',
    'if-none-match',
    'if-range',
    'if-unmodified-since',
    'range',
]);
function filterHeadersForUpstream(headers, targetHost) {
    const filtered = {};
    for (const [key, value] of Object.entries(headers)) {
        if (!PROBLEMATIC_HEADERS.has(key.toLowerCase()) && value !== undefined) {
            filtered[key] = value;
        }
    }
    filtered['host'] = targetHost;
    return filtered;
}
async function handleStreamingRequest(req, res, correlationId) {
    const targetUrl = `${environment_1.envConfig.OPENROUTER_BASE_URL}/api/v1${req.path}`;
    const targetHost = new URL(environment_1.envConfig.OPENROUTER_BASE_URL).host;
    const proxyHeaders = filterHeadersForUpstream(req.headers, targetHost);
    const modifiedBody = req.body
        ? (0, provider_routing_1.injectAnthropicProvider)(req.body, correlationId)
        : req.body;
    const bodyString = modifiedBody ? JSON.stringify(modifiedBody) : '';
    const bodySize = Buffer.byteLength(bodyString, 'utf8');
    logger_1.Logger.info('Streaming request initiated', correlationId, {
        targetUrl,
        method: req.method,
        hasBody: !!req.body,
        bodySize,
    });
    const hasWeaveData = req.hasWeaveData || false;
    const hasLangfuseData = req.hasLangfuseData || false;
    const shouldTrace = hasWeaveData || hasLangfuseData;
    logger_1.Logger.info('Tracing flags check', correlationId, {
        hasWeaveData,
        hasLangfuseData,
        shouldTrace,
    });
    let streamBuffer = '';
    let chunkCount = 0;
    let totalBytes = 0;
    let lastFinishReason = null;
    let lastChunkPreview = '';
    try {
        const axiosConfig = {
            method: req.method,
            url: targetUrl,
            headers: proxyHeaders,
            data: modifiedBody,
            timeout: 300000,
            responseType: 'stream',
            validateStatus: () => true,
            httpsAgent: new https_1.default.Agent({
                keepAlive: true,
                timeout: 300000,
                rejectUnauthorized: environment_1.envConfig.NODE_TLS_REJECT_UNAUTHORIZED,
            }),
        };
        const response = await (0, retry_1.withRetry)(() => (0, axios_1.default)(axiosConfig), correlationId, retry_1.DEFAULT_RETRY_CONFIG);
        logger_1.Logger.info('Upstream response received', correlationId, {
            statusCode: response.status,
            headers: Object.keys(response.headers),
        });
        res.status(response.status);
        const responseHeaders = { ...response.headers };
        delete responseHeaders['transfer-encoding'];
        res.set(responseHeaders);
        response.data.on('data', (chunk) => {
            chunkCount++;
            totalBytes += chunk.length;
            const chunkStr = chunk.toString();
            try {
                const lines = chunkStr.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                        const jsonStr = line.substring(6);
                        if (jsonStr.trim()) {
                            const parsed = JSON.parse(jsonStr);
                            if (parsed.choices?.[0]?.finish_reason) {
                                lastFinishReason = parsed.choices[0].finish_reason;
                            }
                            lastChunkPreview = jsonStr.substring(0, 200);
                            if ((0, environment_1.isStreamDebugEnabled)()) {
                                const delta = parsed.choices?.[0]?.delta || {};
                                const deltaKeys = Object.keys(delta);
                                logger_1.Logger.info('[STREAM_DEBUG] FROM_OPENROUTER', correlationId, {
                                    deltaKeys,
                                    hasContent: !!delta.content,
                                    contentPreview: delta.content?.substring(0, 100),
                                    hasThinking: !!delta.thinking,
                                    thinkingPreview: delta.thinking?.substring(0, 100),
                                    hasThinkingDelta: !!delta.thinking_delta,
                                    thinkingDeltaPreview: delta.thinking_delta?.substring(0, 100),
                                    hasReasoning: !!delta.reasoning,
                                    reasoningPreview: delta.reasoning?.substring(0, 100),
                                    finishReason: parsed.choices?.[0]?.finish_reason,
                                    role: delta.role,
                                    chunkNum: chunkCount,
                                });
                            }
                        }
                    }
                }
            }
            catch {
            }
            streamBuffer += chunkStr;
            if ((0, environment_1.isStreamDebugEnabled)()) {
                logger_1.Logger.info('[STREAM_DEBUG] TO_CLIENT', correlationId, {
                    chunkNum: chunkCount,
                    chunkSize: chunk.length,
                });
            }
            res.write(chunk);
        });
        response.data.on('error', (error) => {
            logger_1.Logger.error('Upstream stream error', correlationId, {
                error: error.message,
                chunkCount,
                totalBytes,
            });
            if (!res.writableEnded) {
                res.end();
            }
        });
        response.data.on('close', () => {
            logger_1.Logger.info('Upstream stream closed', correlationId, {
                chunkCount,
                totalBytes,
                streamBufferLength: streamBuffer.length,
            });
            if (!res.writableEnded) {
                res.end();
            }
        });
        response.data.on('end', async () => {
            logger_1.Logger.info('Upstream stream ended normally', correlationId, {
                chunkCount,
                totalBytes,
                finishReason: lastFinishReason,
                lastChunkPreview: lastChunkPreview.substring(0, 100),
            });
            if (streamBuffer && req.body?.model) {
                try {
                    const { parseAndAccumulateSSE } = await Promise.resolve().then(() => __importStar(require('../utils/sse-parser')));
                    const accumulated = parseAndAccumulateSSE(streamBuffer, correlationId);
                    if (accumulated.usage.promptTokens) {
                        const limits = (0, model_limits_1.getModelLimits)(req.body.model);
                        const warningLevel = (0, model_limits_1.getWarningLevel)(accumulated.usage.promptTokens, limits);
                        logger_1.Logger.info('Context warning check', correlationId, {
                            model: req.body.model,
                            promptTokens: accumulated.usage.promptTokens,
                            maxTokens: limits.maxContextTokens,
                            warningLevel,
                            percentage: Math.round((accumulated.usage.promptTokens / limits.maxContextTokens) * 100),
                        });
                        if (warningLevel !== 'none') {
                            const warningText = (0, context_warning_1.generateContextWarning)(warningLevel, accumulated.usage.promptTokens, limits.maxContextTokens);
                            if (warningText && !res.writableEnded) {
                                const warningChunk = (0, context_warning_1.createWarningSSEChunk)(warningText);
                                res.write(warningChunk);
                                logger_1.Logger.info('Context warning injected', correlationId, {
                                    level: warningLevel,
                                    promptTokens: accumulated.usage.promptTokens,
                                    maxTokens: limits.maxContextTokens,
                                });
                            }
                        }
                    }
                }
                catch (error) {
                    logger_1.Logger.error('Failed to inject context warning', correlationId, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
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
        req.on('close', () => {
            logger_1.Logger.info('Client connection closed', correlationId, {
                chunkCount,
                totalBytes,
                aborted: req.destroyed,
            });
            if (response.data && !response.data.destroyed) {
                response.data.destroy();
            }
        });
        res.on('error', (error) => {
            logger_1.Logger.error('Response stream error', correlationId, {
                error: error.message,
                chunkCount,
                totalBytes,
            });
        });
    }
    catch (error) {
        logger_1.Logger.error('Streaming proxy request error', correlationId, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            chunkCount,
            totalBytes,
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
    }
}
async function v1ProxyHandler(req, res, next) {
    if (req.path === '/credits' && req.method === 'GET') {
        return next();
    }
    const correlationId = req.correlationId;
    try {
        const isStreamingRequest = req.body && req.body.stream === true;
        if (isStreamingRequest) {
            await handleStreamingRequest(req, res, correlationId);
            return;
        }
        const fullPath = `/api/v1${req.path}`;
        if (req.body) {
            req.body = (0, provider_routing_1.injectAnthropicProvider)(req.body, correlationId);
        }
        const openRouterRequest = (0, proxy_utils_1.createOpenRouterRequest)(req, fullPath, correlationId);
        let proxyResponse;
        const isChatCompletion = req.path === '/chat/completions';
        const hasWeaveData = req.__weaveRequestData;
        const hasLangfuseData = req.__langfuseRequestData;
        const needsTracing = isChatCompletion &&
            (((0, weave_1.isWeaveEnabled)() && hasWeaveData) ||
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
            if ((0, weave_1.isWeaveEnabled)() &&
                hasWeaveData &&
                (0, langfuse_1.isLangfuseEnabled)() &&
                hasLangfuseData) {
                const weaveTracedCall = (0, weave_tracing_1.createTracedLLMCall)(request => services_1.proxyService.makeRequest(request), openRouterRequest);
                const llmResponse = await weaveTracedCall(llmInput);
                (0, langfuse_tracing_1.createTracedLangfuseLLMCall)(async () => ({ status: 200, headers: {}, data: llmResponse }), openRouterRequest, llmInput)().catch(error => {
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
                const tracedCall = (0, weave_tracing_1.createTracedLLMCall)(request => services_1.proxyService.makeRequest(request), openRouterRequest);
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
                const tracedCall = (0, langfuse_tracing_1.createTracedLangfuseLLMCall)(request => services_1.proxyService.makeRequest(request), openRouterRequest, llmInput);
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