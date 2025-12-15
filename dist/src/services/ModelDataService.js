"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelDataService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const environment_1 = require("../config/environment");
class ModelDataService {
    constructor() {
        this.modelCache = new Map();
        this.initialized = false;
        this.lastFetchTime = null;
    }
    async fetchModels() {
        try {
            if (!environment_1.envConfig.OPENROUTER_API_KEY) {
                logger_1.Logger.warn('OPENROUTER_API_KEY not set - skipping model data fetch. Will use fallback limits.', 'startup');
                return false;
            }
            logger_1.Logger.info('Fetching model data from OpenRouter API', 'startup');
            const response = await axios_1.default.get('https://openrouter.ai/api/v1/models', {
                headers: {
                    Authorization: `Bearer ${environment_1.envConfig.OPENROUTER_API_KEY}`,
                },
                timeout: 10000,
            });
            this.modelCache.clear();
            for (const model of response.data.data) {
                const maxContextTokens = model.context_length ??
                    model.per_request_limits?.prompt_tokens ??
                    32000;
                const maxPromptTokens = model.per_request_limits?.prompt_tokens ??
                    model.context_length ??
                    32000;
                this.modelCache.set(model.id, {
                    maxContextTokens,
                    maxPromptTokens,
                });
            }
            this.initialized = true;
            this.lastFetchTime = Date.now();
            logger_1.Logger.info('Model data fetched successfully', 'startup', {
                modelCount: this.modelCache.size,
            });
            return true;
        }
        catch (error) {
            logger_1.Logger.error('Failed to fetch model data from OpenRouter', 'startup', {
                error: error instanceof Error ? error.message : String(error),
            });
            this.initialized = false;
            return false;
        }
    }
    getModelLimits(modelId) {
        return this.modelCache.get(modelId) ?? null;
    }
    isInitialized() {
        return this.initialized;
    }
    getModelCount() {
        return this.modelCache.size;
    }
    getLastFetchTime() {
        return this.lastFetchTime;
    }
}
exports.ModelDataService = ModelDataService;
//# sourceMappingURL=ModelDataService.js.map