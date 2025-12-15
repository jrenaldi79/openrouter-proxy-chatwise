"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContextWarning = generateContextWarning;
exports.createWarningSSEChunk = createWarningSSEChunk;
function formatTokenCount(num) {
    if (num >= 1000000) {
        return `${Math.round(num / 1000)}k`;
    }
    if (num >= 1000) {
        return `${Math.round(num / 1000)}k`;
    }
    return num.toString();
}
function generateContextWarning(level, promptTokens, maxTokens) {
    if (level === 'none') {
        return null;
    }
    const percentage = Math.round((promptTokens / maxTokens) * 100);
    const promptFormatted = formatTokenCount(promptTokens);
    const maxFormatted = formatTokenCount(maxTokens);
    const messages = {
        info: `📊 Context: ${percentage}% used (${promptFormatted}/${maxFormatted} tokens). Your conversation is getting long.`,
        warning: `⚠️ Context: ${percentage}% used (${promptFormatted}/${maxFormatted} tokens). Consider summarizing or starting a new chat for better response quality.`,
        critical: `🚨 Context: ${percentage}% used (${promptFormatted}/${maxFormatted} tokens). Approaching limit - response quality may degrade. Start a new chat soon.`,
    };
    return messages[level];
}
function createWarningSSEChunk(warningText) {
    const sseData = {
        choices: [
            {
                index: 0,
                delta: {
                    content: `\n\n${warningText}`,
                },
            },
        ],
    };
    return `data: ${JSON.stringify(sseData)}\n\n`;
}
//# sourceMappingURL=context-warning.js.map