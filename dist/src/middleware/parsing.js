"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bodyParserErrorHandler = bodyParserErrorHandler;
exports.applyBodyParsing = applyBodyParsing;
const express_1 = __importDefault(require("express"));
function bodyParserErrorHandler(error, req, res, next) {
    if (error.type === 'entity.too.large') {
        res.status(413).json({
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'Request payload too large',
                correlationId: req.correlationId || 'unknown',
            },
        });
        return;
    }
    next(error);
}
function applyBodyParsing(app) {
    app.use(express_1.default.json({ limit: '100mb' }));
    app.use(express_1.default.raw({ type: 'application/octet-stream', limit: '100mb' }));
    app.use(bodyParserErrorHandler);
}
//# sourceMappingURL=parsing.js.map