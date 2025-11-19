"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.correlationMiddleware = correlationMiddleware;
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
function correlationMiddleware(req, res, next) {
    const correlationId = (0, uuid_1.v4)();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    logger_1.Logger.request(req.method, req.path, correlationId);
    logger_1.Logger.debug(`Request headers and body logged`, correlationId, {
        headers: req.headers,
        body: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
    });
    next();
}
//# sourceMappingURL=correlation.js.map