"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = notFoundHandler;
exports.errorHandler = errorHandler;
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
function notFoundHandler(req, res) {
    const correlationId = req.correlationId;
    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found',
            correlationId,
        },
    });
}
function errorHandler(error, req, res, _next) {
    const correlationId = req.correlationId || (0, uuid_1.v4)();
    logger_1.Logger.error('Unhandled error in middleware', correlationId, {
        error: error.message,
        stack: error.stack,
    });
    res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            correlationId,
        },
    });
}
//# sourceMappingURL=error-handling.js.map