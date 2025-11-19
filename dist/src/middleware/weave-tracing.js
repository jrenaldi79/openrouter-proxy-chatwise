"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weaveTracingMiddleware = weaveTracingMiddleware;
exports.createTracedLLMCall = createTracedLLMCall;
const weave_1 = require("../config/weave");
const logger_1 = require("../utils/logger");
function weaveTracingMiddleware(req, res, next) {
    if (!(0, weave_1.isWeaveEnabled)()) {
        return next();
    }
    const authHeader = req.headers.authorization;
    const apiKey = authHeader?.replace(/^Bearer\s+/i, '');
    if (!(0, weave_1.isApiKeyAllowed)(apiKey)) {
        return next();
    }
    const correlationId = req.correlationId || 'unknown';
    const requestBody = req.body;
    req.__weaveRequestData = {
        model: requestBody.model,
        messages: requestBody.messages,
        temperature: requestBody.temperature,
        max_tokens: requestBody.max_tokens,
        correlationId,
    };
    logger_1.Logger.info('Weave tracing enabled for request', correlationId, {
        model: requestBody.model,
        messageCount: requestBody.messages?.length || 0,
    });
    next();
}
function createTracedLLMCall(proxyFn, openRouterRequest) {
    async function openrouterChatCompletion(input) {
        const response = await proxyFn(openRouterRequest);
        const responseData = response.data;
        return responseData;
    }
    const tracedOp = weave_1.weave.op(openrouterChatCompletion, {
        name: 'openrouter.chat.completions',
        parameterNames: 'useParam0Object',
    });
    return tracedOp;
}
//# sourceMappingURL=weave-tracing.js.map