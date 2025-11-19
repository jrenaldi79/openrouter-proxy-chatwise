"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
exports.default = createApp;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const environment_1 = require("./config/environment");
const weave_1 = require("./config/weave");
const langfuse_1 = require("./config/langfuse");
const security_1 = require("./middleware/security");
const parsing_1 = require("./middleware/parsing");
const correlation_1 = require("./middleware/correlation");
const weave_tracing_1 = require("./middleware/weave-tracing");
const langfuse_tracing_1 = require("./middleware/langfuse-tracing");
const balance_injection_1 = require("./middleware/balance-injection");
const error_handling_1 = require("./middleware/error-handling");
const health_1 = require("./routes/health");
const credits_1 = require("./routes/credits");
const proxy_api_v1_1 = require("./routes/proxy-api-v1");
const proxy_v1_models_1 = require("./routes/proxy-v1-models");
const proxy_v1_auth_1 = require("./routes/proxy-v1-auth");
const proxy_v1_general_1 = require("./routes/proxy-v1-general");
async function createApp() {
    const app = (0, express_1.default)();
    await (0, weave_1.initializeWeave)();
    await (0, langfuse_1.initializeLangfuse)();
    (0, security_1.applySecurity)(app);
    (0, parsing_1.applyBodyParsing)(app);
    app.use(correlation_1.correlationMiddleware);
    app.get('/health', health_1.healthCheck);
    app.use('/api/v1/me/credits', credits_1.creditsMethodValidation);
    app.get('/api/v1/me/credits', credits_1.meCreditsHandler);
    app.get('/api/v1/credits', credits_1.apiCreditsHandler);
    app.get('/v1/credits', credits_1.v1CreditsHandler);
    app.use(['/api/v1/chat/completions', '/v1/chat/completions'], weave_tracing_1.weaveTracingMiddleware, langfuse_tracing_1.langfuseTracingMiddleware);
    app.use(['/api/v1/chat/completions', '/v1/chat/completions'], balance_injection_1.balanceInjectionMiddleware);
    app.use('/api/v1', proxy_api_v1_1.apiV1ProxyHandler);
    app.get('/v1/models', proxy_v1_models_1.v1ModelsHandler);
    app.get('/v1/auth/key', proxy_v1_auth_1.v1AuthKeyHandler);
    app.use('/v1', proxy_v1_general_1.v1ProxyHandler);
    app.use(error_handling_1.notFoundHandler);
    app.use(error_handling_1.errorHandler);
    return app;
}
if (require.main === module) {
    void createApp().then(app => {
        app.listen(environment_1.envConfig.PORT, () => {
            console.log(`OpenRouter Proxy Server listening on port ${environment_1.envConfig.PORT}`);
            console.log(`Proxying to: ${environment_1.envConfig.OPENROUTER_BASE_URL}`);
        });
    });
}
//# sourceMappingURL=app.js.map