"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureTrustProxy = configureTrustProxy;
exports.securityMiddleware = securityMiddleware;
exports.configureRateLimit = configureRateLimit;
exports.applySecurity = applySecurity;
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const environment_1 = require("../config/environment");
function configureTrustProxy(app) {
    if (environment_1.envConfig.NODE_ENV === 'production') {
        app.set('trust proxy', true);
    }
}
function securityMiddleware(req, res, next) {
    if (req.path === '/v1/credits' ||
        req.path === '/api/v1/credits' ||
        req.path === '/api/v1/me/credits' ||
        req.path === '/v1/models' ||
        req.path === '/v1/auth/key' ||
        req.path === '/v1/chat/completions') {
        return next();
    }
    (0, helmet_1.default)()(req, res, next);
}
function configureRateLimit(app) {
    if (environment_1.envConfig.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
        const limiter = (0, express_rate_limit_1.default)({
            windowMs: environment_1.envConfig.RATE_LIMIT_WINDOW_MS,
            max: environment_1.envConfig.RATE_LIMIT_MAX_REQUESTS,
            message: {
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests',
                    correlationId: '',
                },
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
        app.use(limiter);
    }
}
function applySecurity(app) {
    app.disable('x-powered-by');
    configureTrustProxy(app);
    app.use(securityMiddleware);
    app.use((0, cors_1.default)());
    configureRateLimit(app);
}
//# sourceMappingURL=security.js.map