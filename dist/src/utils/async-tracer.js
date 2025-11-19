"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.traceStreamingCompletion = traceStreamingCompletion;
const logger_1 = require("./logger");
const weave_1 = require("../config/weave");
const langfuse_1 = require("../config/langfuse");
const weave_tracing_1 = require("../middleware/weave-tracing");
const langfuse_tracing_1 = require("../middleware/langfuse-tracing");
async function traceStreamingCompletion(input, response, correlationId, hasWeaveData, hasLangfuseData) {
    try {
        const mockRequest = {
            correlationId,
        };
        const mockProxyResponse = {
            status: 200,
            headers: {},
            data: {
                id: response.id || 'stream-' + Date.now(),
                created: response.created || Math.floor(Date.now() / 1000),
                model: response.model || input.model,
                object: 'chat.completion',
                choices: [
                    {
                        finish_reason: response.finishReason || 'stop',
                        index: 0,
                        message: {
                            content: response.content,
                            role: response.role,
                        },
                    },
                ],
                usage: {
                    prompt_tokens: response.usage.promptTokens || 0,
                    completion_tokens: response.usage.completionTokens || 0,
                    total_tokens: response.usage.totalTokens || 0,
                },
            },
        };
        const llmInput = {
            model: input.model,
            messages: input.messages,
            temperature: input.temperature ?? 1,
            max_tokens: input.max_tokens,
            top_p: input.top_p ?? 1,
            n: input.n ?? 1,
            presence_penalty: input.presence_penalty ?? 0,
            frequency_penalty: input.frequency_penalty ?? 0,
            correlationId,
        };
        if ((0, weave_1.isWeaveEnabled)() && hasWeaveData) {
            try {
                const weaveTracedCall = (0, weave_tracing_1.createTracedLLMCall)(async () => mockProxyResponse, mockRequest);
                await weaveTracedCall(llmInput);
                logger_1.Logger.info('Weave trace created for streaming completion', correlationId, {
                    model: input.model,
                    contentLength: response.content.length,
                });
            }
            catch (weaveError) {
                logger_1.Logger.error('Weave streaming trace failed (non-blocking)', correlationId, {
                    error: weaveError instanceof Error
                        ? weaveError.message
                        : String(weaveError),
                });
            }
        }
        if ((0, langfuse_1.isLangfuseEnabled)() && hasLangfuseData) {
            try {
                const langfuseTracedCall = (0, langfuse_tracing_1.createTracedLangfuseLLMCall)(async () => mockProxyResponse, mockRequest, llmInput);
                await langfuseTracedCall();
                logger_1.Logger.info('Langfuse trace created for streaming completion', correlationId, {
                    model: input.model,
                    contentLength: response.content.length,
                });
            }
            catch (langfuseError) {
                logger_1.Logger.error('Langfuse streaming trace failed (non-blocking)', correlationId, {
                    error: langfuseError instanceof Error
                        ? langfuseError.message
                        : String(langfuseError),
                });
            }
        }
        if ((0, weave_1.isWeaveEnabled)() &&
            hasWeaveData &&
            (0, langfuse_1.isLangfuseEnabled)() &&
            hasLangfuseData) {
            logger_1.Logger.info('Both Weave and Langfuse streaming traces created', correlationId, {
                model: input.model,
            });
        }
    }
    catch (error) {
        logger_1.Logger.error('Async streaming trace failed', correlationId, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
    }
}
//# sourceMappingURL=async-tracer.js.map