"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envConfig = void 0;
exports.loadEnvironmentConfig = loadEnvironmentConfig;
function loadEnvironmentConfig() {
    return {
        PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
        NODE_ENV: process.env.NODE_ENV || 'development',
        OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai',
        REQUEST_TIMEOUT_MS: process.env.REQUEST_TIMEOUT_MS
            ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
            : 30000,
        RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS
            ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
            : 60000,
        RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS
            ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
            : 100,
        ENABLE_TRANSFORMATION: process.env.ENABLE_TRANSFORMATION !== 'false',
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
        WANDB_API_KEY: process.env.WANDB_API_KEY,
        WEAVE_PROJECT_NAME: process.env.WEAVE_PROJECT_NAME,
        WEAVE_API_KEY_ALLOWLIST: process.env.WEAVE_API_KEY_ALLOWLIST
            ? process.env.WEAVE_API_KEY_ALLOWLIST.split(',').map(key => key.trim())
            : [],
        WEAVE_ENABLED: !!process.env.WANDB_API_KEY && !!process.env.WEAVE_PROJECT_NAME,
        LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
        LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
        LANGFUSE_API_KEY_ALLOWLIST: process.env.LANGFUSE_API_KEY_ALLOWLIST
            ? process.env.LANGFUSE_API_KEY_ALLOWLIST.split(',').map(key => key.trim())
            : [],
        LANGFUSE_ENABLED: !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY,
    };
}
exports.envConfig = loadEnvironmentConfig();
//# sourceMappingURL=environment.js.map