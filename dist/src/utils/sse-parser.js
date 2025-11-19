"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSSEBuffer = parseSSEBuffer;
exports.accumulateStreamResponse = accumulateStreamResponse;
exports.parseAndAccumulateSSE = parseAndAccumulateSSE;
const logger_1 = require("./logger");
function parseSSEBuffer(buffer, correlationId) {
    const chunks = [];
    const events = buffer.split('\n\n');
    for (const event of events) {
        if (!event.trim())
            continue;
        if (event.includes('[DONE]'))
            continue;
        const dataMatch = event.match(/^data: (.+)$/m);
        if (!dataMatch || !dataMatch[1])
            continue;
        try {
            const jsonStr = dataMatch[1];
            const chunk = JSON.parse(jsonStr);
            chunks.push(chunk);
        }
        catch (error) {
            logger_1.Logger.error('Failed to parse SSE chunk JSON', correlationId, {
                error: error instanceof Error ? error.message : String(error),
                chunkPreview: event.substring(0, 200),
            });
        }
    }
    return chunks;
}
function accumulateStreamResponse(chunks, correlationId) {
    const accumulated = {
        id: null,
        model: null,
        created: null,
        content: '',
        role: 'assistant',
        finishReason: null,
        usage: {
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
        },
        error: null,
    };
    for (const chunk of chunks) {
        if (chunk.id && !accumulated.id) {
            accumulated.id = chunk.id;
        }
        if (chunk.model && !accumulated.model) {
            accumulated.model = chunk.model;
        }
        if (chunk.created && !accumulated.created) {
            accumulated.created = chunk.created;
        }
        if (chunk.choices && chunk.choices.length > 0 && chunk.choices[0]) {
            const choice = chunk.choices[0];
            if (choice.delta?.role) {
                accumulated.role = choice.delta.role;
            }
            if (choice.delta?.content) {
                accumulated.content += choice.delta.content;
            }
            if (choice.finish_reason) {
                accumulated.finishReason = choice.finish_reason;
            }
        }
        if (chunk.usage) {
            accumulated.usage.promptTokens = chunk.usage.prompt_tokens || null;
            accumulated.usage.completionTokens =
                chunk.usage.completion_tokens || null;
            accumulated.usage.totalTokens = chunk.usage.total_tokens || null;
        }
    }
    logger_1.Logger.info('Accumulated streaming response', correlationId, {
        id: accumulated.id,
        model: accumulated.model,
        contentLength: accumulated.content.length,
        finishReason: accumulated.finishReason,
        hasUsage: accumulated.usage.totalTokens !== null,
    });
    return accumulated;
}
function parseAndAccumulateSSE(buffer, correlationId) {
    const chunks = parseSSEBuffer(buffer, correlationId);
    return accumulateStreamResponse(chunks, correlationId);
}
//# sourceMappingURL=sse-parser.js.map