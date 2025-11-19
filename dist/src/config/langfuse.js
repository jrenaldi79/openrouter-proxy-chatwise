"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeLangfuse = initializeLangfuse;
exports.isLangfuseEnabled = isLangfuseEnabled;
exports.isApiKeyAllowed = isApiKeyAllowed;
exports.shutdownLangfuse = shutdownLangfuse;
const sdk_node_1 = require("@opentelemetry/sdk-node");
const otel_1 = require("@langfuse/otel");
const environment_1 = require("./environment");
const logger_1 = require("../utils/logger");
let langfuseInitialized = false;
let sdk = null;
async function initializeLangfuse() {
    if (langfuseInitialized) {
        logger_1.Logger.info('Langfuse already initialized');
        return true;
    }
    if (!environment_1.envConfig.LANGFUSE_ENABLED) {
        logger_1.Logger.info('Langfuse observability disabled (LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set)');
        return false;
    }
    try {
        if (environment_1.envConfig.LANGFUSE_PUBLIC_KEY) {
            process.env.LANGFUSE_PUBLIC_KEY = environment_1.envConfig.LANGFUSE_PUBLIC_KEY;
        }
        if (environment_1.envConfig.LANGFUSE_SECRET_KEY) {
            process.env.LANGFUSE_SECRET_KEY = environment_1.envConfig.LANGFUSE_SECRET_KEY;
        }
        if (environment_1.envConfig.LANGFUSE_BASE_URL) {
            process.env.LANGFUSE_BASE_URL = environment_1.envConfig.LANGFUSE_BASE_URL;
        }
        sdk = new sdk_node_1.NodeSDK({
            spanProcessors: [new otel_1.LangfuseSpanProcessor()],
        });
        sdk.start();
        langfuseInitialized = true;
        logger_1.Logger.info(`Langfuse observability initialized (base URL: ${environment_1.envConfig.LANGFUSE_BASE_URL || 'default'})`);
        return true;
    }
    catch (error) {
        logger_1.Logger.error('Failed to initialize Langfuse observability', undefined, {
            error: error instanceof Error ? error.message : 'Unknown initialization error',
            baseUrl: environment_1.envConfig.LANGFUSE_BASE_URL,
        });
        return false;
    }
}
function isLangfuseEnabled() {
    return langfuseInitialized && environment_1.envConfig.LANGFUSE_ENABLED;
}
function isApiKeyAllowed(apiKey) {
    if (!isLangfuseEnabled()) {
        return true;
    }
    if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
        return true;
    }
    if (environment_1.envConfig.LANGFUSE_API_KEY_ALLOWLIST.length === 0) {
        return true;
    }
    if (!apiKey) {
        return false;
    }
    return environment_1.envConfig.LANGFUSE_API_KEY_ALLOWLIST.includes(apiKey);
}
async function shutdownLangfuse() {
    if (sdk) {
        try {
            await sdk.shutdown();
            logger_1.Logger.info('Langfuse SDK shut down successfully');
        }
        catch (error) {
            logger_1.Logger.error('Error shutting down Langfuse SDK', undefined, {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
}
//# sourceMappingURL=langfuse.js.map