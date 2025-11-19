"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.balanceInjectionMiddleware = balanceInjectionMiddleware;
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const AuthToken_1 = require("../models/AuthToken");
const OpenRouterRequest_1 = require("../models/OpenRouterRequest");
const logger_1 = require("../utils/logger");
const services_1 = require("../config/services");
const environment_1 = require("../config/environment");
const weave_1 = require("../config/weave");
const langfuse_1 = require("../config/langfuse");
const sse_parser_1 = require("../utils/sse-parser");
const async_tracer_1 = require("../utils/async-tracer");
async function balanceInjectionMiddleware(req, res, next) {
    const correlationId = req.correlationId;
    logger_1.Logger.balanceMiddleware(`${req.method} ${req.path} - body:${!!req.body}`, correlationId);
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || '';
    const origin = req.headers['origin'] || '';
    logger_1.Logger.balanceClient(false, userAgent, correlationId, { origin, referer });
    if (req.method !== 'POST' || !req.body) {
        logger_1.Logger.balanceDebug(`SKIPPING: Not POST or no body - method:${req.method} body:${!!req.body}`, correlationId);
        return next();
    }
    try {
        const chatRequest = req.body;
        logger_1.Logger.balanceDebug(`PARSED REQUEST: messages:${chatRequest?.messages?.length || 0}`, correlationId);
        const isChatWise = services_1.balanceInjectionService.isChatWiseClient(req.headers);
        logger_1.Logger.balanceClient(isChatWise, userAgent, correlationId);
        if (!isChatWise) {
            logger_1.Logger.info('SKIPPING: Not a ChatWise client', correlationId);
            return next();
        }
        const isNewSession = services_1.balanceInjectionService.isNewSession(chatRequest);
        logger_1.Logger.balanceSession(isNewSession, chatRequest?.messages?.length || 0, correlationId);
        if (!isNewSession) {
            logger_1.Logger.info('SKIPPING: Not a new session', correlationId);
            return next();
        }
        const authToken = AuthToken_1.AuthToken.fromRequest(req);
        logger_1.Logger.balanceAuth(!!authToken, authToken?.isValid || false, correlationId);
        if (!authToken || !authToken.isValid) {
            logger_1.Logger.info('AUTH FAILED: Passing to main handler', correlationId);
            return next();
        }
        logger_1.Logger.balanceStream(!!chatRequest.stream, correlationId);
        if (!chatRequest.stream) {
            logger_1.Logger.info('NON-STREAMING: Skipping balance injection', correlationId);
            return next();
        }
        logger_1.Logger.balanceInfo('Starting balance injection for new session', correlationId);
        logger_1.Logger.balanceDebug('Fetching user balance...', correlationId);
        const balance = await services_1.balanceInjectionService.getUserBalance(authToken, correlationId);
        logger_1.Logger.balanceDebug(`Balance fetch result: ${balance ? 'SUCCESS' : 'FAILED'}`, correlationId);
        if (!balance) {
            logger_1.Logger.balanceError('Balance fetch failed, continuing to main handler', correlationId);
            return next();
        }
        const usedDollars = balance.usedCredits.toFixed(2);
        const totalDollars = balance.totalCredits.toFixed(2);
        const balanceText = balance.totalCredits === -1
            ? `💰 Account: Unlimited credits ($${usedDollars} used)\n\n`
            : `💰 Balance: $${totalDollars} remaining ($${usedDollars} used)\n\n`;
        logger_1.Logger.balanceInfo('Setting up streaming with balance injection', correlationId);
        try {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'X-Correlation-Id': correlationId,
            });
            const chatId = services_1.balanceInjectionService.generateChatId();
            logger_1.Logger.balanceDebug(`Generated chat ID: ${chatId}`, correlationId);
            logger_1.Logger.balanceDebug('Creating OpenRouter request...', correlationId);
            const openRouterPath = req.originalUrl.startsWith('/v1/')
                ? `/api${req.originalUrl}`
                : req.originalUrl;
            logger_1.Logger.balanceDebug(`Path mapping: ${req.originalUrl} -> ${openRouterPath}`, correlationId);
            const openRouterRequest = OpenRouterRequest_1.OpenRouterRequest.fromProxyRequest({
                method: 'POST',
                path: openRouterPath,
                headers: req.headers,
                body: chatRequest,
                query: req.query,
            }, environment_1.envConfig.OPENROUTER_BASE_URL, environment_1.envConfig.REQUEST_TIMEOUT_MS).withCorrelationId(correlationId);
            logger_1.Logger.balanceDebug('OpenRouter request created', correlationId);
            const axiosConfig = {
                method: openRouterRequest.method,
                url: openRouterRequest.url,
                headers: openRouterRequest.headers,
                data: openRouterRequest.body,
                timeout: openRouterRequest.timeout,
                responseType: 'stream',
                httpsAgent: new https_1.default.Agent({
                    keepAlive: true,
                    timeout: 60000,
                    rejectUnauthorized: environment_1.envConfig.NODE_TLS_REJECT_UNAUTHORIZED,
                }),
            };
            logger_1.Logger.balanceDebug('Making axios request...', correlationId);
            const response = await (0, axios_1.default)(axiosConfig);
            logger_1.Logger.balanceDebug('Axios response received', correlationId);
            if (response.status !== 200) {
                logger_1.Logger.balanceError('OpenRouter returned non-200 status', correlationId, undefined, { status: response.status });
                res.write('data: [DONE]\n\n');
                res.end();
                return;
            }
            logger_1.Logger.balanceInfo('Setting up streaming with balance injection', correlationId);
            let isFirstContentChunk = true;
            let chunkBuffer = '';
            const hasWeaveData = req
                .__weaveRequestData;
            const hasLangfuseData = req.__langfuseRequestData;
            const needsTracing = ((0, weave_1.isWeaveEnabled)() && hasWeaveData) ||
                ((0, langfuse_1.isLangfuseEnabled)() && hasLangfuseData);
            let tracingBuffer = needsTracing ? '' : null;
            response.data.on('data', (chunk) => {
                const chunkStr = chunk.toString();
                logger_1.Logger.balanceEvent('Received chunk', correlationId, {
                    chunkPreview: chunkStr.substring(0, 100),
                });
                chunkBuffer += chunkStr;
                if (tracingBuffer !== null) {
                    tracingBuffer += chunkStr;
                }
                const events = chunkBuffer.split('\n\n');
                chunkBuffer = events.pop() || '';
                for (const event of events) {
                    if (!event.trim())
                        continue;
                    logger_1.Logger.balanceEvent(`Checking event: ${event.substring(0, 200)}`, correlationId);
                    let modifiedEvent = event;
                    modifiedEvent = modifiedEvent.replace(/"id":"[^"]+"/g, `"id":"${chatId}"`);
                    if (isFirstContentChunk && event.startsWith('data: {')) {
                        try {
                            const jsonStr = event.substring(6);
                            const jsonObj = JSON.parse(jsonStr);
                            if (jsonObj.choices &&
                                jsonObj.choices[0] &&
                                jsonObj.choices[0].delta &&
                                jsonObj.choices[0].delta.content &&
                                jsonObj.choices[0].delta.content.trim()) {
                                logger_1.Logger.info('Found content chunk - injecting balance', correlationId);
                                jsonObj.choices[0].delta.content =
                                    balanceText + jsonObj.choices[0].delta.content;
                                modifiedEvent = `data: ${JSON.stringify(jsonObj)}`;
                                isFirstContentChunk = false;
                                logger_1.Logger.info('Balance injected into first chunk', correlationId);
                            }
                            else {
                                logger_1.Logger.info('Skipping event - no content or empty', correlationId);
                            }
                        }
                        catch (error) {
                            logger_1.Logger.error('Invalid JSON - skipping injection', correlationId, {
                                error: error instanceof Error ? error.message : String(error),
                            });
                        }
                    }
                    res.write(modifiedEvent + '\n\n');
                    logger_1.Logger.info('Event relayed', correlationId);
                }
            });
            response.data.on('end', () => {
                logger_1.Logger.info('Stream ended', correlationId);
                res.end();
                if (tracingBuffer !== null && needsTracing) {
                    logger_1.Logger.info('Stream completed, starting async trace', correlationId);
                    void (async () => {
                        try {
                            const accumulatedResponse = (0, sse_parser_1.parseAndAccumulateSSE)(tracingBuffer, correlationId);
                            const tracingInput = {
                                model: chatRequest.model || 'unknown',
                                messages: chatRequest.messages || [],
                                temperature: chatRequest.temperature,
                                max_tokens: chatRequest.max_tokens,
                                top_p: chatRequest.top_p,
                                n: chatRequest.n,
                                presence_penalty: chatRequest.presence_penalty,
                                frequency_penalty: chatRequest.frequency_penalty,
                            };
                            await (0, async_tracer_1.traceStreamingCompletion)(tracingInput, accumulatedResponse, correlationId, !!hasWeaveData, !!hasLangfuseData);
                        }
                        catch (error) {
                            logger_1.Logger.error('Async streaming trace failed (balance injection)', correlationId, {
                                error: error instanceof Error ? error.message : String(error),
                            });
                        }
                    })();
                }
            });
            response.data.on('error', (error) => {
                logger_1.Logger.error('Stream error', correlationId, {
                    error: error.message || String(error),
                });
                res.write('data: [DONE]\n\n');
                res.end();
            });
            logger_1.Logger.info('All handlers set up', correlationId);
        }
        catch (streamError) {
            logger_1.Logger.error('Streaming setup error', correlationId, streamError instanceof Error
                ? { error: streamError.message }
                : { error: String(streamError) });
            res.write('data: [DONE]\n\n');
            res.end();
        }
        return;
    }
    catch (error) {
        logger_1.Logger.error('Balance injection error', correlationId, error instanceof Error
            ? { error: error.message }
            : { error: String(error) });
        return next();
    }
}
//# sourceMappingURL=balance-injection.js.map