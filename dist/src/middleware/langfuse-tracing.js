"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.langfuseTracingMiddleware = langfuseTracingMiddleware;
exports.createTracedLangfuseLLMCall = createTracedLangfuseLLMCall;
const tracing_1 = require("@langfuse/tracing");
const langfuse_1 = require("../config/langfuse");
const logger_1 = require("../utils/logger");
function langfuseTracingMiddleware(req, res, next) {
    if (!(0, langfuse_1.isLangfuseEnabled)()) {
        return next();
    }
    const authHeader = req.headers.authorization;
    const apiKey = authHeader?.replace(/^Bearer\s+/i, '');
    if (!(0, langfuse_1.isApiKeyAllowed)(apiKey)) {
        return next();
    }
    const correlationId = req.correlationId || 'unknown';
    const requestBody = req.body;
    req.__langfuseRequestData =
        {
            model: requestBody.model,
            messages: requestBody.messages,
            temperature: requestBody.temperature,
            max_tokens: requestBody.max_tokens,
            correlationId,
        };
    logger_1.Logger.info('Langfuse tracing enabled for request', correlationId, {
        model: requestBody.model,
        messageCount: requestBody.messages?.length || 0,
    });
    next();
}
function createTracedLangfuseLLMCall(proxyFn, openRouterRequest, llmInput) {
    return async () => {
        return await (0, tracing_1.startActiveObservation)('openrouter-chat-completion', async (trace) => {
            trace.update({
                input: {
                    model: llmInput.model,
                    messages: llmInput.messages,
                    parameters: {
                        temperature: llmInput.temperature,
                        max_tokens: llmInput.max_tokens,
                        top_p: llmInput.top_p,
                        n: llmInput.n,
                        presence_penalty: llmInput.presence_penalty,
                        frequency_penalty: llmInput.frequency_penalty,
                    },
                },
                metadata: {
                    messageCount: llmInput.messages.length,
                    hasSystemPrompt: llmInput.messages.some(m => m.role === 'system'),
                    correlationId: llmInput.correlationId,
                },
            });
            if (llmInput.correlationId) {
                trace.setTags?.([llmInput.correlationId]);
            }
            const generation = trace.startObservation('llm-generation', {
                input: llmInput.messages,
                modelParameters: {
                    model: llmInput.model,
                    temperature: llmInput.temperature || 1,
                    max_tokens: llmInput.max_tokens || 0,
                    top_p: llmInput.top_p || 1,
                    n: llmInput.n || 1,
                    presence_penalty: llmInput.presence_penalty || 0,
                    frequency_penalty: llmInput.frequency_penalty || 0,
                },
            }, { asType: 'generation' });
            try {
                const response = await proxyFn(openRouterRequest);
                const responseData = response.data;
                generation.update({
                    output: {
                        id: responseData.id,
                        model: responseData.model,
                        choices: responseData.choices,
                    },
                    usageDetails: {
                        input: responseData.usage?.prompt_tokens || 0,
                        output: responseData.usage?.completion_tokens || 0,
                        total: responseData.usage?.total_tokens || 0,
                    },
                    metadata: {
                        finish_reason: responseData.choices[0]?.finish_reason,
                        response_id: responseData.id,
                    },
                });
                trace.update({
                    output: {
                        content: responseData.choices[0]?.message?.content,
                        finish_reason: responseData.choices[0]?.finish_reason,
                        usage: responseData.usage,
                    },
                });
                generation.end();
                logger_1.Logger.info('Langfuse trace created for chat completion', openRouterRequest.correlationId || 'unknown', {
                    model: responseData.model,
                    tokens: responseData.usage?.total_tokens,
                });
                return responseData;
            }
            catch (error) {
                generation.update({
                    level: 'ERROR',
                    statusMessage: error instanceof Error ? error.message : 'Unknown error',
                });
                generation.end();
                trace.update({
                    level: 'ERROR',
                    output: {
                        error: error instanceof Error ? error.message : 'Unknown error',
                    },
                });
                logger_1.Logger.error('Error in Langfuse traced LLM call', openRouterRequest.correlationId || 'unknown', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined,
                });
                throw error;
            }
        });
    };
}
//# sourceMappingURL=langfuse-tracing.js.map