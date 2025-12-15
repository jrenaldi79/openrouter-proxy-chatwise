"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelLimits = getModelLimits;
exports.getWarningPercentage = getWarningPercentage;
exports.getWarningLevel = getWarningLevel;
const services_1 = require("./services");
const MODEL_PATTERNS = {
    anthropic: /^(anthropic\/|claude)/i,
    openai: /^(openai\/|gpt-)/i,
    gemini: /^(google\/|gemini)/i,
    grok: /^(x-ai\/|grok)/i,
};
const PROVIDER_LIMITS = {
    anthropic: 400000,
    openai: 128000,
    gemini: 1000000,
    grok: 128000,
    unknown: 32000,
};
const MODEL_SPECIFIC_LIMITS = {
    'gpt-4': 32000,
    'gpt-3.5': 32000,
};
const WARNING_THRESHOLDS = {
    INFO: 25,
    WARNING: 40,
    CRITICAL: 50,
};
function getModelLimits(model) {
    if (services_1.modelDataService.isInitialized()) {
        const dynamicLimits = services_1.modelDataService.getModelLimits(model);
        if (dynamicLimits) {
            let provider = 'unknown';
            for (const [providerName, pattern] of Object.entries(MODEL_PATTERNS)) {
                if (pattern.test(model)) {
                    provider = providerName;
                    break;
                }
            }
            return {
                provider,
                maxContextTokens: dynamicLimits.maxPromptTokens,
            };
        }
    }
    return getStaticModelLimits(model);
}
function getStaticModelLimits(model) {
    const normalizedModel = model.toLowerCase().replace(/^(openai\/|anthropic\/|google\/|x-ai\/)/, '');
    for (const [modelPrefix, limit] of Object.entries(MODEL_SPECIFIC_LIMITS)) {
        if (normalizedModel === modelPrefix || normalizedModel.startsWith(modelPrefix + '-')) {
            if (modelPrefix === 'gpt-4' && (normalizedModel.includes('turbo') || normalizedModel.includes('gpt-4o'))) {
                continue;
            }
            let provider = 'unknown';
            for (const [providerName, pattern] of Object.entries(MODEL_PATTERNS)) {
                if (pattern.test(model)) {
                    provider = providerName;
                    break;
                }
            }
            return {
                provider,
                maxContextTokens: limit,
            };
        }
    }
    for (const [providerName, pattern] of Object.entries(MODEL_PATTERNS)) {
        if (pattern.test(model)) {
            return {
                provider: providerName,
                maxContextTokens: PROVIDER_LIMITS[providerName],
            };
        }
    }
    return {
        provider: 'unknown',
        maxContextTokens: PROVIDER_LIMITS.unknown,
    };
}
function getWarningPercentage(promptTokens, limits) {
    const percentage = (promptTokens / limits.maxContextTokens) * 100;
    return Math.round(percentage * 100) / 100;
}
function getWarningLevel(promptTokens, limits) {
    const rawPercentage = (promptTokens / limits.maxContextTokens) * 100;
    if (rawPercentage >= WARNING_THRESHOLDS.CRITICAL) {
        return 'critical';
    }
    if (rawPercentage >= WARNING_THRESHOLDS.WARNING) {
        return 'warning';
    }
    if (rawPercentage >= WARNING_THRESHOLDS.INFO) {
        return 'info';
    }
    return 'none';
}
//# sourceMappingURL=model-limits.js.map